"""Audit Log: every change made through the admin app (and import runs), newest first."""
import json

from PySide6.QtCore import Qt
from PySide6.QtGui import QFontDatabase
from PySide6.QtWidgets import (
    QAbstractItemView, QComboBox, QHBoxLayout, QHeaderView, QPlainTextEdit, QPushButton,
    QSplitter, QTableWidget, QTableWidgetItem,
)

import data
import ui

TABLES = ["All tables", "hymns", "hymn_scripture_refs", "hymn_topics", "topics", "prayers",
          "studies", "plans", "plan_days"]


class AuditPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Audit Log", "The latest 500 changes. Select one to see what changed.")
        self.rows = []
        top = QHBoxLayout()
        self.table_filter = QComboBox()
        self.table_filter.addItems(TABLES)
        self.table_filter.currentIndexChanged.connect(self.refresh)
        top.addWidget(self.table_filter)
        top.addStretch()
        btn = QPushButton("Refresh")
        btn.clicked.connect(self.refresh)
        top.addWidget(btn)
        self.body.addLayout(top)

        split = QSplitter(Qt.Orientation.Vertical)
        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(["When", "Who", "Action", "Table", "Row"])
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.verticalHeader().hide()
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setAlternatingRowColors(True)
        self.table.currentCellChanged.connect(lambda row, *_: self._show(row))
        split.addWidget(self.table)
        self.detail = QPlainTextEdit()
        self.detail.setReadOnly(True)
        self.detail.setFont(QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont))
        split.addWidget(self.detail)
        split.setSizes([480, 260])
        self.body.addWidget(split, 1)

    def refresh(self, *_):
        i = self.table_filter.currentIndex()
        table = None if i <= 0 else TABLES[i]
        self.win.run(self.win.data.audit_log, 500, table, on_done=self._got_rows, message="Loading audit log…")

    def _got_rows(self, rows):
        self.rows = rows
        self.table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            when = row["at"][:19].replace("T", " ")
            for c, text in enumerate((when, row["actor"], row["action"], row["table_name"], row["row_id"] or "")):
                self.table.setItem(r, c, QTableWidgetItem(text))
        self.detail.setPlainText("")
        if rows:
            self.table.selectRow(0)

    def _show(self, r):
        if not 0 <= r < len(self.rows):
            return
        row = self.rows[r]
        lines = [f"{row['action']} on {row['table_name']} {row['row_id'] or ''} by {row['actor']} at {row['at']}", ""]
        if row["before"] is None and row["after"] is not None:
            lines.append("Created:" if row["action"] == "insert" else "Details:")
            lines += [f"  {k}: {data.short(v)}" for k, v in row["after"].items()]
        else:
            changes = data.changed_fields(row["before"], row["after"])
            lines.append("Changed:" if changes else "No field changes recorded.")
            for field, old, new in changes:
                lines.append(f"  {field}:\n      before: {data.short(old, 200)}\n      after:  {data.short(new, 200)}")
        lines += ["", "Full JSON", "  before: " + json.dumps(row["before"]), "  after:  " + json.dumps(row["after"])]
        self.detail.setPlainText("\n".join(lines))
