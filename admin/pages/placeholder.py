"""Pages that arrive in later phases (Studies and Plans in Phase 4)."""
from PySide6.QtGui import QFontDatabase
from PySide6.QtWidgets import QPlainTextEdit

import ui
from data import ENV_PATH

REPORT = ENV_PATH.parent.parent / "pipeline" / "out" / "import-report.txt"


class StudiesPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Studies", "The study editor arrives in Phase 4.")
        self.body.addStretch()


class PlansPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Plans", "The plan builder arrives in Phase 4.")
        self.body.addStretch()


class PipelinePage(ui.Page):
    """For now: how to run the importers, and the last import report."""

    def __init__(self, win):
        super().__init__(win, "Pipeline",
                         "Run the importers from a terminal in the repo root (with the venv active):")
        self.body.addWidget(ui.label(
            "<code>python pipeline/import_hymns.py --dry-run</code> then without <code>--dry-run</code><br>"
            "<code>python pipeline/import_prayers.py</code><br>"
            "Then use Settings → Reload all data.", wrap=True))
        self.body.addWidget(ui.label("Last import report", "sectionTitle"))
        self.report = QPlainTextEdit()
        self.report.setReadOnly(True)
        self.report.setFont(QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont))
        self.body.addWidget(self.report, 1)

    def refresh(self):
        self.report.setPlainText(REPORT.read_text(encoding="utf-8") if REPORT.exists()
                                 else "No import has been run on this computer yet.")
