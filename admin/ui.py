"""ui.py - small building blocks shared by the pages."""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QComboBox, QFrame, QLabel, QMessageBox, QVBoxLayout, QWidget

from data import STATUSES


class Page(QWidget):
    """A page in the main window: a title, then whatever the page adds to self.body.

    `win` is the MainWindow, which provides win.data (data.py) and win.run(...)
    to call it in the background."""

    def __init__(self, win, title, subtitle=None):
        super().__init__()
        self.win = win
        self.setObjectName("page")
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(24, 18, 24, 18)
        outer.setSpacing(10)
        outer.addWidget(label(title, "pageTitle"))
        if subtitle:
            outer.addWidget(label(subtitle, "muted", wrap=True))
        self.body = outer

    def refresh(self):
        """Reload from the database (called when the page is shown)."""

    def select(self, row_id):
        """Jump to one item (used by the dashboard's validation panel)."""


def label(text, name=None, wrap=False):
    w = QLabel(text)
    if name:
        w.setObjectName(name)
    w.setWordWrap(wrap)
    w.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
    return w


def card():
    """A rounded panel; returns (frame, its layout)."""
    frame = QFrame()
    frame.setObjectName("card")
    lay = QVBoxLayout(frame)
    lay.setContentsMargins(16, 14, 16, 14)
    return frame, lay


def status_combo():
    box = QComboBox()
    box.addItems(STATUSES)
    box.setToolTip("draft → approved → published (only published is visible in the public app)")
    return box


def error(parent, text):
    QMessageBox.warning(parent, "Hymnal Reader Admin", text)


def confirm(parent, text):
    return QMessageBox.question(parent, "Hymnal Reader Admin", text) == QMessageBox.StandardButton.Yes


def mark_invalid(widget, invalid):
    """Red border via style.qss ([invalid="true"])."""
    widget.setProperty("invalid", "true" if invalid else "false")
    widget.style().unpolish(widget)
    widget.style().polish(widget)
