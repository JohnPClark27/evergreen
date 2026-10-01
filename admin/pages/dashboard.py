"""Dashboard: counts by status, Free tier usage, and a clickable list of problems."""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QGridLayout, QHBoxLayout, QListWidget, QListWidgetItem, QProgressBar, QPushButton,
)

import data
import ui

TABLES = (("hymns", "Hymns"), ("prayers", "Prayers"), ("studies", "Studies"), ("plans", "Plans"))
MB = 1024 * 1024


class DashboardPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Dashboard", "Only published content is visible in the public app.")

        # Counts by status: one card per table
        grid = QGridLayout()
        grid.setSpacing(12)
        self.count_labels = {}
        for col, (table, title) in enumerate(TABLES):
            frame, lay = ui.card()
            lay.addWidget(ui.label(title, "sectionTitle"))
            big = ui.label("…", "bigNumber")
            detail = ui.label("", "muted")
            lay.addWidget(big)
            lay.addWidget(detail)
            self.count_labels[table] = (big, detail)
            grid.addWidget(frame, 0, col)
        self.body.addLayout(grid)

        row = QHBoxLayout()
        row.setSpacing(12)

        # Free tier usage
        frame, lay = ui.card()
        lay.addWidget(ui.label("Supabase Free tier", "sectionTitle"))
        self.storage_bar = QProgressBar()
        self.storage_bar.setRange(0, 1024)
        self.storage_bar.setFormat("checking…")
        lay.addWidget(self.storage_bar)
        self.storage_detail = ui.label("", "muted", wrap=True)
        lay.addWidget(self.storage_detail)
        lay.addWidget(ui.label(
            "Free projects <b>pause after 7 days</b> with no activity. "
            "If the public app stops loading, open the Supabase dashboard and click "
            "<b>Restore project</b> (see docs/DEPLOY.md). Egress limit: 5 GB/month.", wrap=True))
        lay.addStretch()
        row.addWidget(frame, 2)

        # Validation panel
        frame, lay = ui.card()
        head = QHBoxLayout()
        head.addWidget(ui.label("Problems to fix", "sectionTitle"))
        head.addStretch()
        refresh = QPushButton("Refresh")
        refresh.clicked.connect(self.refresh)
        head.addWidget(refresh)
        lay.addLayout(head)
        lay.addWidget(ui.label("Click a problem to open it.", "muted"))
        self.problems = QListWidget()
        self.problems.itemActivated.connect(self._jump)
        self.problems.itemClicked.connect(self._jump)
        lay.addWidget(self.problems, 1)
        row.addWidget(frame, 3)

        self.body.addLayout(row, 1)

    def refresh(self):
        self.win.run(self.win.data.status_counts, on_done=self._show_counts, message="Counting…")
        self.win.run(self.win.data.validation_problems, on_done=self._show_problems, message="Checking content…")
        self.win.run(self.win.data.storage_usage, on_done=self._show_storage, message="Listing Storage…")

    def _show_counts(self, counts):
        for table, (big, detail) in self.count_labels.items():
            c = counts.get(table, {})
            big.setText(str(sum(c.values())))
            detail.setText("  ·  ".join(f"{c.get(s, 0)} {s}" for s in data.STATUSES))

    def _show_storage(self, sizes):
        total = sum(sizes.values())
        self.storage_bar.setValue(min(1024, round(total / MB)))
        self.storage_bar.setFormat(f"Storage {total / MB:.0f} MB of 1024 MB")
        over = total > data.STORAGE_TARGET_BYTES
        self.storage_detail.setText(
            "  ·  ".join(f"{b}: {s / MB:.1f} MB" for b, s in sizes.items())
            + f"<br>Target: stay under {data.STORAGE_TARGET_BYTES // MB} MB"
            + (" <b>(over target!)</b>" if over else ""))

    def _show_problems(self, problems):
        self.problems.clear()
        if not problems:
            self.problems.addItem("Nothing to fix.")
            return
        # Group by kind, keeping the order kinds first appear in.
        kinds = list(dict.fromkeys(p["kind"] for p in problems))
        problems = sorted(problems, key=lambda p: kinds.index(p["kind"]))
        last_kind = None
        for p in problems:
            if p["kind"] != last_kind:
                n = sum(1 for x in problems if x["kind"] == p["kind"])
                head = QListWidgetItem(f"{p['kind']} ({n})")
                f = head.font()
                f.setBold(True)
                head.setFont(f)
                head.setFlags(Qt.ItemFlag.NoItemFlags | Qt.ItemFlag.ItemIsEnabled)
                self.problems.addItem(head)
                last_kind = p["kind"]
            item = QListWidgetItem(f"    {p['label']}")
            item.setData(Qt.ItemDataRole.UserRole, (p["page"], p["row_id"]))
            self.problems.addItem(item)

    def _jump(self, item):
        target = item.data(Qt.ItemDataRole.UserRole)
        if target:
            self.win.show_page(*target)
