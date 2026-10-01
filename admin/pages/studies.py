"""Studies: list of sessions on the left, the StudyEditor on the right."""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox, QLineEdit, QListWidget, QListWidgetItem, QPushButton, QSplitter, QVBoxLayout, QWidget,
)

import data
import ui
from pages.study_editor import StudyEditor


def load_choices(d):
    """Hymns + prayers for the pickers (one background call)."""
    return d.hymns(), d.prayers()


class StudiesPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Studies",
                         "A study is one session: Hymn → Scripture → Prayer. "
                         "Scripture is stored as a reference only; the text comes from YouVersion when shown.")
        self.rows = []
        split = QSplitter()
        self.body.addWidget(split, 1)

        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 8, 0)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Search studies…")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self._fill)
        ll.addWidget(self.search)
        self.status_filter = QComboBox()
        self.status_filter.addItems(["All statuses", *data.STATUSES])
        self.status_filter.currentIndexChanged.connect(self._fill)
        ll.addWidget(self.status_filter)
        self.list = QListWidget()
        self.list.currentItemChanged.connect(self._picked)
        ll.addWidget(self.list, 1)
        new_btn = QPushButton("New study")
        new_btn.clicked.connect(self._new)
        ll.addWidget(new_btn)
        left.setMinimumWidth(280)
        split.addWidget(left)

        self.editor = StudyEditor(win)
        self.editor.saved.connect(self._saved)
        self.editor.setEnabled(False)
        split.addWidget(self.editor)
        split.setSizes([300, 1000])

    def refresh(self):
        # One call, so the pickers always have hymns/prayers before a study is shown.
        def load(d=self.win.data):
            return (*load_choices(d), d.studies())
        self.win.run(load, on_done=self._got_all, message="Loading studies…")

    def _got_all(self, result):
        hymns, prayers, rows = result
        self.editor.set_choices(hymns, prayers)
        if self.editor.study:
            # Re-show the open study with fresh choices (unless it has unsaved edits).
            fresh = next((s for s in rows if s["id"] == self.editor.study["id"]), None)
            if fresh and not self.editor.dirty():
                self.editor.load(fresh)
        self.rows = rows
        self._fill()
        pending = getattr(self, "pending_select", None)
        if pending:
            self.pending_select = None
            self.select(pending)

    def _fill(self, *_):
        keep = self.editor.study["id"] if self.editor.study else None
        words = self.search.text().casefold().split()
        i = self.status_filter.currentIndex()
        status = None if i == 0 else data.STATUSES[i - 1]
        self.list.blockSignals(True)
        self.list.clear()
        for s in self.rows:
            if status and s["status"] != status:
                continue
            if not all(w in s["title"].casefold() for w in words):
                continue
            item = QListWidgetItem(f"{s['title']}\n    {s['status']}")
            item.setData(Qt.ItemDataRole.UserRole, s["id"])
            self.list.addItem(item)
            if s["id"] == keep:
                self.list.setCurrentItem(item)
        self.list.blockSignals(False)

    def select(self, row_id):
        if not self.rows:
            self.pending_select = row_id
            return
        self.search.clear()
        self.status_filter.setCurrentIndex(0)
        for i in range(self.list.count()):
            if self.list.item(i).data(Qt.ItemDataRole.UserRole) == row_id:
                self.list.setCurrentRow(i)

    def _picked(self, item, previous):
        if item is None:
            return
        if self.editor.dirty() and not ui.confirm(self, "Discard unsaved changes to this study?"):
            self.list.blockSignals(True)
            self.list.setCurrentItem(previous)
            self.list.blockSignals(False)
            return
        study = next(s for s in self.rows if s["id"] == item.data(Qt.ItemDataRole.UserRole))
        self.editor.setEnabled(True)
        self.editor.load(study)

    def _new(self):
        if self.editor.dirty() and not ui.confirm(self, "Discard unsaved changes to this study?"):
            return
        self.list.clearSelection()
        self.editor.setEnabled(True)
        self.editor.load(None)

    def _saved(self, study):
        self.rows = sorted([r for r in self.rows if r["id"] != study["id"]] + [study],
                           key=lambda r: r["title"].casefold())
        self._fill()
