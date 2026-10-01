"""worker.py - run slow calls (network, Storage listings) off the UI thread.

    w = Worker(data.hymns)                     # any function + its arguments
    w.done.connect(show_hymns); w.start()

If the function takes a `progress` keyword, it gets a callback
progress(percent, message) that is safely forwarded to the UI thread.
"""
import inspect

from PySide6.QtCore import QThread, Signal


class Worker(QThread):
    progress = Signal(int, str)   # percent 0-100 (or -1 for "busy"), message
    done = Signal(object)         # the function's return value
    failed = Signal(str)          # a readable error message

    def __init__(self, fn, *args, **kwargs):
        super().__init__()
        self.fn, self.args, self.kwargs = fn, args, kwargs
        if "progress" in inspect.signature(fn).parameters:
            self.kwargs["progress"] = self.progress.emit

    def run(self):
        # Runs in the background thread. Signals are delivered to the UI thread.
        try:
            result = self.fn(*self.args, **self.kwargs)
        except Exception as e:  # noqa: BLE001 - every error is shown to the user
            self.failed.emit(friendly_error(e))
        else:
            self.done.emit(result)


def friendly_error(e):
    """Short message for a dialog. PostgREST errors carry a useful 'message'."""
    msg = getattr(e, "message", None) or str(e) or type(e).__name__
    if isinstance(e, ValueError):
        return msg
    return f"{type(e).__name__}: {msg}"
