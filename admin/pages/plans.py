"""Plans: build a multi-day plan from studies.

Days are edited locally (drag to reorder, add, duplicate, remove) and written with
"Save plan". "Publish plan" only succeeds when every day's study, hymn, and prayer
is already published; otherwise it lists what's missing and changes nothing.
"""
from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QAbstractItemView, QComboBox, QDialog, QDialogButtonBox, QFormLayout, QHBoxLayout, QInputDialog,
    QLineEdit, QListWidget, QListWidgetItem, QPlainTextEdit, QPushButton, QSplitter, QVBoxLayout, QWidget,
)

import data
import ui
from books import ref_label
from pages.study_editor import StudyEditor
from pages.studies import load_choices

ROLE = Qt.ItemDataRole.UserRole


def day_text(n, s):
    hymn = f"#{s['hymn']['number']} {s['hymn']['title']}" if s.get("hymn") else "no hymn"
    prayer = s["prayer"]["title"] if s.get("prayer") else "no prayer"
    ref = ref_label(s["book"], s["chapter"], s["verse_start"], s["verse_end"])
    return f"Day {n}   {s['title']}   [{s['status']}]\n        {hymn}  ·  {ref}  ·  {prayer}"


class PickStudyDialog(QDialog):
    """Search and pick an existing study."""

    def __init__(self, parent, studies):
        super().__init__(parent)
        self.setWindowTitle("Add an existing study")
        self.resize(560, 520)
        self.studies, self.chosen = studies, None
        lay = QVBoxLayout(self)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Search studies…")
        self.search.textChanged.connect(self._fill)
        lay.addWidget(self.search)
        self.list = QListWidget()
        self.list.itemDoubleClicked.connect(lambda _: self.accept())
        lay.addWidget(self.list, 1)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(self.accept)
        bb.rejected.connect(self.reject)
        lay.addWidget(bb)
        self._fill()

    def _fill(self, *_):
        words = self.search.text().casefold().split()
        self.list.clear()
        for s in self.studies:
            if all(w in s["title"].casefold() for w in words):
                item = QListWidgetItem(f"{s['title']}  ·  {s['status']}")
                item.setData(ROLE, s)
                self.list.addItem(item)
        self.list.setCurrentRow(0)

    def accept(self):
        item = self.list.currentItem()
        self.chosen = item.data(ROLE) if item else None
        super().accept()


class NewStudyDialog(QDialog):
    """The full StudyEditor in a dialog; closes once the study is saved."""

    def __init__(self, win, hymns, prayers):
        super().__init__(win)
        self.setWindowTitle("New study")
        self.resize(1150, 760)
        self.created = None
        lay = QVBoxLayout(self)
        self.editor = StudyEditor(win)
        self.editor.set_choices(hymns, prayers)
        self.editor.load(None)
        self.editor.saved.connect(self._saved)
        lay.addWidget(self.editor)

    def _saved(self, study):
        self.created = study
        self.accept()


class PlansPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Plans", "Build a multi-day plan from studies. Drag days to reorder them.")
        self.plans, self.studies, self.choices = [], [], ([], [])
        self.plan = None
        self.saved_state = None

        split = QSplitter()
        self.body.addWidget(split, 1)

        # ---------- left: plans
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 8, 0)
        self.plan_list = QListWidget()
        self.plan_list.currentItemChanged.connect(self._plan_picked)
        ll.addWidget(self.plan_list, 1)
        new_plan = QPushButton("New plan")
        new_plan.clicked.connect(self._new_plan)
        ll.addWidget(new_plan)
        split.addWidget(left)

        # ---------- right: plan editor
        right = QWidget()
        self.editor_box = right
        rl = QVBoxLayout(right)
        rl.setContentsMargins(8, 0, 0, 0)
        form = QFormLayout()
        self.f_title = QLineEdit()
        self.f_desc = QPlainTextEdit()
        self.f_desc.setFixedHeight(56)
        self.f_status = QComboBox()
        self.f_status.addItems([s for s in data.STATUSES if s != "published"])
        self.f_status.setToolTip("Use “Publish plan” to publish: it checks every day first.")
        self.status_label = ui.label("", "muted")
        status_row = QHBoxLayout()
        status_row.addWidget(self.status_label)
        status_row.addStretch()
        status_row.addWidget(ui.label("Set to:", "muted"))
        status_row.addWidget(self.f_status)
        form.addRow("Title", self.f_title)
        form.addRow("Description", self.f_desc)
        form.addRow("Status", status_row)
        rl.addLayout(form)

        rl.addWidget(ui.label("Days", "sectionTitle"))
        self.days = QListWidget()
        self.days.setDragDropMode(QAbstractItemView.DragDropMode.InternalMove)
        self.days.setDefaultDropAction(Qt.DropAction.MoveAction)
        self.days.setAlternatingRowColors(True)
        # Renumber after drag-and-drop. Deferred one tick so a dropped item's data is in place.
        for sig in (self.days.model().rowsMoved, self.days.model().rowsInserted, self.days.model().rowsRemoved):
            sig.connect(lambda *_: QTimer.singleShot(0, self._days_changed))
        rl.addWidget(self.days, 3)

        day_btns = QHBoxLayout()
        for text, fn in (("Add existing study…", self._add_existing), ("New study…", self._add_new),
                         ("Duplicate day", self._duplicate), ("Remove day", self._remove),
                         ("Move up", lambda: self._move(-1)), ("Move down", lambda: self._move(1))):
            b = QPushButton(text)
            b.clicked.connect(fn)
            day_btns.addWidget(b)
        day_btns.addStretch()
        rl.addLayout(day_btns)

        rl.addWidget(ui.label("Warnings", "sectionTitle"))
        self.warnings = QListWidget()
        self.warnings.setMaximumHeight(130)
        rl.addWidget(self.warnings, 1)

        btns = QHBoxLayout()
        btns.addStretch()
        self.revert_btn = QPushButton("Revert")
        self.revert_btn.clicked.connect(lambda: self._load_plan(self.plan))
        self.save_btn = QPushButton("Save plan")
        self.save_btn.clicked.connect(self._save)
        self.publish_btn = QPushButton("Publish plan")
        self.publish_btn.setObjectName("primary")
        self.publish_btn.clicked.connect(self._publish)
        for b in (self.revert_btn, self.save_btn, self.publish_btn):
            btns.addWidget(b)
        rl.addLayout(btns)
        split.addWidget(right)
        split.setSizes([280, 1020])
        right.setEnabled(False)

    # ------------------------------------------------------------ loading

    def refresh(self):
        self.win.run(self.win.data.plans, on_done=self._got_plans, message="Loading plans…")
        self.win.run(self.win.data.studies, on_done=lambda rows: setattr(self, "studies", rows))
        self.win.run(load_choices, self.win.data, on_done=lambda c: setattr(self, "choices", c))

    def _got_plans(self, plans):
        self.plans = plans
        keep = getattr(self, "pending_select", None) or (self.plan["id"] if self.plan else None)
        self.pending_select = None
        self.plan_list.blockSignals(True)
        self.plan_list.clear()
        for p in plans:
            item = QListWidgetItem(f"{p['title']}\n    {p['status']}")
            item.setData(ROLE, p["id"])
            self.plan_list.addItem(item)
        self.plan_list.blockSignals(False)
        if keep:
            self.select(keep)

    def select(self, row_id):
        if not self.plans:
            self.pending_select = row_id
            return
        for i in range(self.plan_list.count()):
            if self.plan_list.item(i).data(ROLE) == row_id:
                self.plan_list.setCurrentRow(i)

    def _plan_picked(self, item, previous):
        if item is None:
            return
        if self._dirty() and not ui.confirm(self, "Discard unsaved changes to this plan?"):
            self.plan_list.blockSignals(True)
            self.plan_list.setCurrentItem(previous)
            self.plan_list.blockSignals(False)
            return
        self._load_plan(next(p for p in self.plans if p["id"] == item.data(ROLE)))

    def _load_plan(self, plan):
        if plan is None:
            return
        self.plan = plan
        self.editor_box.setEnabled(False)
        plan_id = plan["id"]

        def load(d=self.win.data):
            return d.plans(), d.plan_days(plan_id)

        def show(result):
            plans, days = result
            self.plan = next(p for p in plans if p["id"] == plan_id)
            self.f_title.setText(self.plan["title"])
            self.f_desc.setPlainText(self.plan["description"] or "")
            self.status_label.setText(f"Currently: {self.plan['status']}")
            if self.plan["status"] != "published":
                self.f_status.setCurrentText(self.plan["status"])
            self.days.clear()
            for d in days:
                self._append_day(d["study"])
            self._days_changed()
            self.saved_state = self._state()
            self.editor_box.setEnabled(True)

        self.win.run(load, on_done=show, message="Loading plan…")

    # ------------------------------------------------------------ days (local edits)

    def _append_day(self, study, row=None):
        item = QListWidgetItem()
        item.setData(ROLE, study)
        if row is None:
            self.days.addItem(item)
        else:
            self.days.insertItem(row, item)

    def _day_studies(self):
        return [self.days.item(i).data(ROLE) for i in range(self.days.count())]

    def _days_changed(self, *_):
        """Renumber the labels and recompute warnings after any change."""
        studies = self._day_studies()
        for i, s in enumerate(studies):
            if s:  # mid-drop, an item may not have its data yet; the next tick fixes it
                self.days.item(i).setText(day_text(i + 1, s))
        studies = [s for s in studies if s]
        self.warnings.clear()
        warnings = data.plan_warnings([{"day_number": i + 1, "study": s} for i, s in enumerate(studies)])
        self.warnings.addItems(warnings or ["No warnings."])

    def _add_existing(self):
        dlg = PickStudyDialog(self, self.studies)
        if dlg.exec() and dlg.chosen:
            self._append_day(dlg.chosen, self._insert_row())
            self._days_changed()

    def _add_new(self):
        dlg = NewStudyDialog(self.win, *self.choices)
        if dlg.exec() and dlg.created:
            self.studies.append(dlg.created)
            self._append_day(dlg.created, self._insert_row())
            self._days_changed()

    def _insert_row(self):
        """New days go after the selected day, or at the end."""
        r = self.days.currentRow()
        return self.days.count() if r < 0 else r + 1

    def _duplicate(self):
        r = self.days.currentRow()
        if r >= 0:
            self._append_day(self.days.item(r).data(ROLE), r + 1)
            self._days_changed()
            self.days.setCurrentRow(r + 1)

    def _remove(self):
        r = self.days.currentRow()
        if r >= 0:
            self.days.takeItem(r)
            self._days_changed()

    def _move(self, step):
        r = self.days.currentRow()
        if 0 <= r + step < self.days.count() and r >= 0:
            item = self.days.takeItem(r)
            self.days.insertItem(r + step, item)
            self.days.setCurrentRow(r + step)
            self._days_changed()

    # ------------------------------------------------------------ saving / publishing

    def _state(self):
        return {"title": self.f_title.text().strip(), "description": self.f_desc.toPlainText().strip() or None,
                "status": self.f_status.currentText(), "days": [s["id"] for s in self._day_studies()]}

    def _dirty(self):
        return self.saved_state is not None and self.editor_box.isEnabled() and self._state() != self.saved_state

    def _save(self, then=None):
        if not self.plan:
            return
        state, old, plan_id = self._state(), self.saved_state, self.plan["id"]
        if not state["title"]:
            ui.error(self, "A plan needs a title.")
            return
        # The status combo only matters when the user changed it (it can't show "published").
        status_changed = state["status"] != old["status"]

        def save(d=self.win.data):
            fields = {k: state[k] for k in ("title", "description") if state[k] != old[k]}
            if fields:
                d.update_plan(plan_id, fields)
            d.set_plan_days(plan_id, state["days"])
            if status_changed:
                d.set_status("plans", plan_id, state["status"])
            return plan_id

        def done(_):
            self.win.statusBar().showMessage("Plan saved.", 4000)
            self._reload_list_then(plan_id, then)

        self.win.run(save, on_done=done, message="Saving plan…")

    def _reload_list_then(self, plan_id, then=None):
        def got(plans):
            self.saved_state = None  # so reselecting doesn't ask about unsaved changes
            self.plans = plans
            self._got_plans(plans)
            self._load_plan(next(p for p in plans if p["id"] == plan_id))
            if then:
                then()
        self.win.run(self.win.data.plans, on_done=got)

    def _publish(self):
        if not self.plan:
            return
        if self._dirty():
            if not ui.confirm(self, "Save your changes to this plan first, then publish?"):
                return
            self._save(then=self._publish)
            return
        plan_id = self.plan["id"]

        def done(blockers):
            if blockers:
                ui.error(self, "Can't publish yet. Publish these first (in Studies, Hymns, or Prayers):\n\n• "
                         + "\n• ".join(blockers))
            else:
                self.win.statusBar().showMessage("Plan published.", 5000)
                self._reload_list_then(plan_id)

        self.win.run(self.win.data.publish_plan, plan_id, on_done=done, message="Checking and publishing…")

    def _new_plan(self):
        title, ok = QInputDialog.getText(self, "New plan", "Plan title:")
        if ok and title.strip():
            self.win.run(self.win.data.create_plan, title.strip(),
                         on_done=lambda p: self._reload_list_then(p["id"]), message="Creating plan…")
