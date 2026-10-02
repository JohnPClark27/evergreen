"""theme.py - light/dark styling that follows the system setting.

Colours come from the public app's design tokens (sepia paper, burgundy accent),
with a matching dark set. style.qss uses @tokens that are filled in here.
"""
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QPalette

QSS = Path(__file__).resolve().parent / "style.qss"

LIGHT = {
    "bg": "#F7F3EA", "surface": "#FFFDF8", "border": "#E4DACA", "border_strong": "#CFC3AE",
    "ink": "#221E19", "muted": "#5A5248", "accent": "#7A2533", "accent_hover": "#651E2A",
    "accent_text": "#7A2533", "on_accent": "#FFFFFF", "accent_soft": "#F1E3E2",
    "highlight": "#F6E1A6", "danger": "#B3261E",
}
DARK = {
    "bg": "#1C1A17", "surface": "#25221E", "border": "#3A352E", "border_strong": "#4D463D",
    "ink": "#EDE6DA", "muted": "#B5AB9C", "accent": "#9E3445", "accent_hover": "#B23E50",
    "accent_text": "#E59AA6", "on_accent": "#FFFFFF", "accent_soft": "#3A2A2C",
    "highlight": "#5C4A1E", "danger": "#F2B8B5",
}


def is_dark(app):
    scheme = app.styleHints().colorScheme()
    if scheme == Qt.ColorScheme.Unknown:
        # Some desktops (e.g. WSLg) don't report a scheme: guess from the window colour.
        return app.palette().color(QPalette.ColorRole.Window).lightness() < 128
    return scheme == Qt.ColorScheme.Dark


def apply(app):
    """Style the whole app, and restyle whenever the system switches light/dark."""
    app.setStyle("Fusion")

    def restyle(*_):
        t = DARK if is_dark(app) else LIGHT
        pal = QPalette()
        for role, key in ((QPalette.ColorRole.Window, "bg"), (QPalette.ColorRole.Base, "surface"),
                          (QPalette.ColorRole.AlternateBase, "bg"), (QPalette.ColorRole.Text, "ink"),
                          (QPalette.ColorRole.WindowText, "ink"), (QPalette.ColorRole.Button, "surface"),
                          (QPalette.ColorRole.ButtonText, "ink"), (QPalette.ColorRole.Highlight, "highlight"),
                          (QPalette.ColorRole.HighlightedText, "ink"), (QPalette.ColorRole.PlaceholderText, "muted"),
                          (QPalette.ColorRole.ToolTipBase, "surface"), (QPalette.ColorRole.ToolTipText, "ink")):
            pal.setColor(role, QColor(t[key]))
        app.setPalette(pal)
        qss = QSS.read_text(encoding="utf-8")
        # Longest names first so @accent doesn't eat @accent_soft.
        for key in sorted(t, key=len, reverse=True):
            qss = qss.replace(f"@{key}", t[key])
        app.setStyleSheet(qss)

    restyle()
    app.styleHints().colorSchemeChanged.connect(restyle)
