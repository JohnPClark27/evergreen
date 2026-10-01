"""Settings: what the app is connected to (never shows the key), and how it behaves."""
from PySide6.QtWidgets import QApplication, QPushButton

import data
import theme
import ui


class SettingsPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Settings")
        frame, lay = ui.card()
        lay.addWidget(ui.label("Connection", "sectionTitle"))
        lay.addWidget(ui.label(f"Supabase URL: {win.data.url}"))
        lay.addWidget(ui.label(f"Settings file: {data.ENV_PATH}"))
        lay.addWidget(ui.label("Service role key: loaded from the settings file (hidden). "
                               "It bypasses RLS, so it must never leave this computer.", "muted", wrap=True))
        lay.addWidget(ui.label(f"Changes are recorded in the Audit Log as: {win.data.actor}"))
        self.body.addWidget(frame)

        frame, lay = ui.card()
        lay.addWidget(ui.label("Appearance", "sectionTitle"))
        self.theme_label = ui.label("")
        lay.addWidget(self.theme_label)
        self.body.addWidget(frame)

        frame, lay = ui.card()
        lay.addWidget(ui.label("Data", "sectionTitle"))
        lay.addWidget(ui.label("Reload everything from the database (e.g. after running an importer).",
                               "muted", wrap=True))
        reload_btn = QPushButton("Reload all data")
        reload_btn.clicked.connect(self._reload)
        lay.addWidget(reload_btn)
        self.body.addWidget(frame)
        self.body.addStretch()

    def refresh(self):
        dark = theme.is_dark(QApplication.instance())
        self.theme_label.setText(f"Follows the system setting (currently {'dark' if dark else 'light'}).")

    def _reload(self):
        hymns = self.win.pages["hymns"]
        hymns.loaded = False
        hymns.refresh()
        self.win.statusBar().showMessage("Reloading…", 3000)
