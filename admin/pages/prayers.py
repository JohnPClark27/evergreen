"""Prayers manager: list + detail. A source is required: Save stays disabled without one."""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFormLayout, QHBoxLayout, QLineEdit, QListWidget, QListWidgetItem, QPlainTextEdit,
    QPushButton, QSplitter, QVBoxLayout, QWidget,
)

import data
import ui


class PrayersPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Prayers",
                         "Prayers come from the Open Prayer Book, or are added here with a source. "
                         "Never write prayer text from memory: paste it from the source you name.")
        self.rows = []
        self.current = None      # selected prayer (dict), or None while adding a new one
        self.saved_state = None
        self.slug_touched = False

        split = QSplitter()
        self.body.addWidget(split, 1)

        # ---------- left: search + list
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 8, 0)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Search title, text, or source…")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self._fill_list)
        ll.addWidget(self.search)
        self.list = QListWidget()
        self.list.currentItemChanged.connect(self._item_changed)
        ll.addWidget(self.list, 1)
        new_btn = QPushButton("New prayer")
        new_btn.clicked.connect(self._new)
        ll.addWidget(new_btn)
        split.addWidget(left)

        # ---------- right: form
        right = QWidget()
        rl = QVBoxLayout(right)
        rl.setContentsMargins(8, 0, 0, 0)
        self.heading = ui.label("Select a prayer", "sectionTitle")
        rl.addWidget(self.heading)
        form = QFormLayout()
        self.f_title, self.f_slug = QLineEdit(), QLineEdit()
        self.f_section, self.f_attribution, self.f_source = QLineEdit(), QLineEdit(), QLineEdit()
        self.f_source.setPlaceholderText("Required: e.g. Book of Common Prayer (1979), p. 832")
        self.f_text = QPlainTextEdit()
        self.f_text.setMinimumHeight(220)
        self.f_status = ui.status_combo()
        form.addRow("Title", self.f_title)
        form.addRow("Slug", self.f_slug)
        form.addRow("Source *", self.f_source)
        form.addRow("Attribution", self.f_attribution)
        form.addRow("Section", self.f_section)
        form.addRow("Status", self.f_status)
        form.addRow("Text", self.f_text)
        rl.addLayout(form, 1)
        self.hint = ui.label("", "error", wrap=True)
        rl.addWidget(self.hint)
        btns = QHBoxLayout()
        btns.addStretch()
        self.revert_btn = QPushButton("Revert")
        self.revert_btn.clicked.connect(lambda: self._show(self.current))
        self.save_btn = QPushButton("Save")
        self.save_btn.setObjectName("primary")
        self.save_btn.clicked.connect(self._save)
        btns.addWidget(self.revert_btn)
        btns.addWidget(self.save_btn)
        rl.addLayout(btns)
        split.addWidget(right)
        split.setSizes([380, 820])

        for w in (self.f_title, self.f_slug, self.f_source):
            w.textChanged.connect(self._validate)
        self.f_text.textChanged.connect(self._validate)
        self.f_title.textChanged.connect(self._auto_slug)
        self.f_slug.textEdited.connect(lambda _: setattr(self, "slug_touched", True))
        self._set_enabled(False)

    # ------------------------------------------------------------ list

    def refresh(self):
        self.win.run(self.win.data.prayers, on_done=self._got_rows, message="Loading prayers…")

    def _got_rows(self, rows):
        self.rows = rows
        self._fill_list()

    def _fill_list(self, *_):
        keep = self.current["id"] if self.current else None
        words = self.search.text().casefold().split()
        self.list.blockSignals(True)
        self.list.clear()
        for p in self.rows:
            hay = f"{p['title']} {p['text']} {p['source']}".casefold()
            if all(w in hay for w in words):
                item = QListWidgetItem(f"{p['title']}   ·   {p['status']}")
                item.setData(Qt.ItemDataRole.UserRole, p["id"])
                self.list.addItem(item)
                if p["id"] == keep:
                    self.list.setCurrentItem(item)
        self.list.blockSignals(False)

    def select(self, row_id):
        for i in range(self.list.count()):
            if self.list.item(i).data(Qt.ItemDataRole.UserRole) == row_id:
                self.list.setCurrentRow(i)

    def _item_changed(self, item, previous):
        if item is None:
            return
        prayer = next(p for p in self.rows if p["id"] == item.data(Qt.ItemDataRole.UserRole))
        if self._dirty() and not ui.confirm(self, "Discard unsaved changes?"):
            self.list.blockSignals(True)
            self.list.setCurrentItem(previous)
            self.list.blockSignals(False)
            return
        self._show(prayer)

    # ------------------------------------------------------------ form

    def _set_enabled(self, on):
        for w in (self.f_title, self.f_slug, self.f_section, self.f_attribution, self.f_source,
                  self.f_text, self.f_status, self.revert_btn):
            w.setEnabled(on)
        self.save_btn.setEnabled(False)

    def _show(self, prayer):
        """Fill the form from a prayer, or blank it for a new one (prayer=None)."""
        self.current = prayer
        p = prayer or {}
        self.heading.setText(p.get("title") or "New prayer")
        self.slug_touched = prayer is not None
        for w, key in ((self.f_title, "title"), (self.f_slug, "slug"), (self.f_section, "section"),
                       (self.f_attribution, "attribution"), (self.f_source, "source")):
            w.setText(p.get(key) or "")
        self.f_text.setPlainText(p.get("text") or "")
        self.f_status.setCurrentText(p.get("status") or "draft")
        self._set_enabled(True)
        self.saved_state = self._state()
        self._validate()

    def _new(self):
        if self._dirty() and not ui.confirm(self, "Discard unsaved changes?"):
            return
        self.list.clearSelection()
        self._show(None)
        self.f_title.setFocus()

    def _auto_slug(self, title):
        if not self.slug_touched:
            self.f_slug.setText(data.slugify(title))

    def _state(self):
        return {
            "title": self.f_title.text().strip(), "slug": self.f_slug.text().strip(),
            "section": self.f_section.text().strip() or None,
            "attribution": self.f_attribution.text().strip() or None,
            "source": self.f_source.text().strip(), "text": self.f_text.toPlainText().strip(),
            "status": self.f_status.currentText(),
        }

    def _dirty(self):
        return self.f_title.isEnabled() and getattr(self, "saved_state", None) is not None \
            and self._state() != self.saved_state

    def _validate(self, *_):
        """Enable Save only when required fields are filled. Source is the key rule."""
        s = self._state()
        missing = [name for name, key in (("source", "source"), ("title", "title"), ("text", "text"),
                                          ("slug", "slug")) if not s[key]]
        ui.mark_invalid(self.f_source, not s["source"])
        if missing:
            self.hint.setText(f"Required before saving: {', '.join(missing)}."
                              + (" Every prayer must say where its text comes from." if "source" in missing else ""))
        else:
            self.hint.setText("")
        self.save_btn.setEnabled(self.f_title.isEnabled() and not missing and self._dirty_or_new())

    def _dirty_or_new(self):
        return self.current is None or self._state() != self.saved_state

    def _save(self):
        s = self._state()
        status = s.pop("status")
        prayer_id = self.current["id"] if self.current else None
        old = self.saved_state

        def save(d=self.win.data):
            if prayer_id is None:
                return d.create_prayer({**s, "status": status})
            fields = {k: v for k, v in s.items() if v != old[k]}
            if fields:
                d.update_prayer(prayer_id, fields)
            if status != old["status"]:
                d.set_status("prayers", prayer_id, status)
            return next(p for p in d.prayers() if p["id"] == prayer_id)

        def saved(prayer):
            self.rows = [r for r in self.rows if r["id"] != prayer["id"]] + [prayer]
            self.rows.sort(key=lambda r: r["title"].casefold())
            self._show(prayer)
            self._fill_list()
            self.win.statusBar().showMessage(f"Saved “{prayer['title']}”.", 4000)

        self.save_btn.setEnabled(False)
        w = self.win.run(save, on_done=saved, message="Saving prayer…")
        w.failed.connect(lambda *_: self._validate())
