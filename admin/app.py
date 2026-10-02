"""
Hymnal Reader Admin - desktop app for managing hymns, prayers, studies, and plans.

Run from the repo root with the venv active:
    python admin/app.py

Needs admin/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).
"""
import os
import sys

# QtMultimedia prints harmless video-acceleration warnings on some Linux setups.
os.environ.setdefault("QT_LOGGING_RULES", "qt.multimedia.symbolsresolver=false")

from PySide6.QtCore import Qt  # noqa: E402
from PySide6.QtWidgets import (  # noqa: E402
    QApplication, QHBoxLayout, QLabel, QListWidget, QMainWindow, QProgressBar,
    QStackedWidget, QVBoxLayout, QWidget,
)

import data  # noqa: E402
import theme  # noqa: E402
import ui  # noqa: E402
from pages.audit import AuditPage  # noqa: E402
from pages.dashboard import DashboardPage  # noqa: E402
from pages.hymns import HymnsPage  # noqa: E402
from pages.placeholder import PipelinePage  # noqa: E402
from pages.plans import PlansPage  # noqa: E402
from pages.prayers import PrayersPage  # noqa: E402
from pages.settings import SettingsPage  # noqa: E402
from pages.studies import StudiesPage  # noqa: E402
from worker import Worker  # noqa: E402

PAGES = [
    ("dashboard", "Dashboard", DashboardPage),
    ("hymns", "Hymns", HymnsPage),
    ("prayers", "Prayers", PrayersPage),
    ("studies", "Studies", StudiesPage),
    ("plans", "Plans", PlansPage),
    ("pipeline", "Pipeline", PipelinePage),
    ("audit", "Audit Log", AuditPage),
    ("settings", "Settings", SettingsPage),
]


class MainWindow(QMainWindow):
    def __init__(self, store):
        super().__init__()
        self.data = store
        self.workers = set()  # keep running QThreads alive until they finish
        self.setWindowTitle("Hymnal Reader Admin")
        self.resize(1280, 820)

        # Left nav + stacked pages
        nav_box = QWidget()
        nav_box.setFixedWidth(200)
        nav_lay = QVBoxLayout(nav_box)
        nav_lay.setContentsMargins(0, 0, 0, 0)
        nav_lay.setSpacing(0)
        title = QLabel("Hymnal Reader\nAdmin")
        title.setObjectName("appTitle")
        nav_lay.addWidget(title)
        self.nav = QListWidget()
        self.nav.setObjectName("nav")
        nav_lay.addWidget(self.nav)
        nav_box.setObjectName("navBox")
        nav_box.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)

        self.stack = QStackedWidget()
        self.pages = {}
        for key, name, cls in PAGES:
            page = cls(self)
            self.pages[key] = page
            self.stack.addWidget(page)
            self.nav.addItem(name)
        self.nav.currentRowChanged.connect(self._show_row)

        central = QWidget()
        lay = QHBoxLayout(central)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        lay.addWidget(nav_box)
        lay.addWidget(self.stack, 1)
        self.setCentralWidget(central)

        # Status bar: message + progress for background work
        self.progress = QProgressBar()
        self.progress.setFixedWidth(220)
        self.progress.hide()
        self.statusBar().addPermanentWidget(self.progress)
        self.nav.setCurrentRow(0)

    # -- navigation

    def _show_row(self, row):
        page = self.stack.widget(row)
        self.stack.setCurrentIndex(row)
        page.refresh()

    def show_page(self, key, row_id=None):
        """Switch pages; optionally select one item there (validation panel jumps)."""
        self.nav.setCurrentRow([k for k, _, _ in PAGES].index(key))
        if row_id is not None:
            self.pages[key].select(row_id)

    # -- background work

    def run(self, fn, *args, on_done=None, message="Working...", **kwargs):
        """Call fn(*args) in a QThread; on_done(result) runs on the UI thread.
        Errors are shown in a dialog. The status bar shows progress meanwhile."""
        w = Worker(fn, *args, **kwargs)
        self.workers.add(w)
        self.statusBar().showMessage(message)
        self.progress.setRange(0, 0)  # "busy" until the worker reports a percentage
        self.progress.show()

        def on_progress(pct, msg):
            if pct >= 0:
                self.progress.setRange(0, 100)
                self.progress.setValue(pct)
            self.statusBar().showMessage(msg)

        def finish():
            self.workers.discard(w)
            if not self.workers:
                self.progress.hide()
                self.statusBar().clearMessage()

        def failed(msg):
            finish()
            ui.error(self, msg)

        def done(result):
            finish()
            if on_done:
                on_done(result)

        w.progress.connect(on_progress)
        w.done.connect(done)
        w.failed.connect(failed)
        w.start()
        return w

    def closeEvent(self, event):
        for w in list(self.workers):
            w.wait(3000)
        super().closeEvent(event)


class ConfigErrorWindow(QMainWindow):
    """Shown instead of the app when admin/.env is missing or incomplete."""

    def __init__(self, missing):
        super().__init__()
        self.setWindowTitle("Hymnal Reader Admin: setup needed")
        self.resize(720, 420)
        page = QWidget()
        page.setObjectName("page")
        lay = QVBoxLayout(page)
        lay.setContentsMargins(40, 40, 40, 40)
        lay.addWidget(ui.label("Can't connect yet", "pageTitle"))
        lay.addWidget(ui.label(
            f"These settings are missing: <b>{', '.join(missing)}</b>", wrap=True))
        lay.addWidget(ui.label(
            f"1. Copy <code>.env.example</code> to <code>{data.ENV_PATH}</code><br>"
            "2. Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "(Supabase dashboard → Project Settings → API)<br>"
            "3. Start the app again.<br><br>"
            "The service role key is secret: keep it only in admin/.env, never in git or web/.",
            wrap=True))
        lay.addStretch()
        self.setCentralWidget(page)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("Hymnal Reader Admin")
    theme.apply(app)
    try:
        win = MainWindow(data.Data(*data.load_config()))
    except data.ConfigError as e:
        win = ConfigErrorWindow(e.missing)
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
