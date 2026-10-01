"""Hymns manager: searchable table on the left, details + editing on the right."""
from PySide6.QtCore import QAbstractTableModel, QModelIndex, QSortFilterProxyModel, Qt, QUrl
from PySide6.QtGui import QFontDatabase
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtWidgets import (
    QAbstractItemView, QCheckBox, QComboBox, QFormLayout, QHBoxLayout, QHeaderView, QLineEdit,
    QPlainTextEdit, QPushButton, QScrollArea, QSplitter, QTableView, QTableWidget,
    QTableWidgetItem, QVBoxLayout, QWidget,
)

import data
import ui
from books import BOOKS

COLUMNS = [("No.", "number"), ("Title", "title"), ("Familiar", "is_familiar"),
           ("Status", "status"), ("Timing", "timing_verified")]
SORT_ROLE = Qt.ItemDataRole.UserRole


class HymnModel(QAbstractTableModel):
    def __init__(self):
        super().__init__()
        self.rows = []

    def set_rows(self, rows):
        self.beginResetModel()
        self.rows = rows
        self.endResetModel()

    def update_row(self, hymn):
        for i, r in enumerate(self.rows):
            if r["id"] == hymn["id"]:
                self.rows[i] = {**r, **hymn}
                self.dataChanged.emit(self.index(i, 0), self.index(i, len(COLUMNS) - 1))
                return

    def row_of(self, hymn_id):
        return next((i for i, r in enumerate(self.rows) if r["id"] == hymn_id), -1)

    def rowCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.rows)

    def columnCount(self, parent=QModelIndex()):
        return len(COLUMNS)

    def headerData(self, section, orientation, role=Qt.ItemDataRole.DisplayRole):
        if orientation == Qt.Orientation.Horizontal and role == Qt.ItemDataRole.DisplayRole:
            return COLUMNS[section][0]
        return None

    def data(self, index, role=Qt.ItemDataRole.DisplayRole):
        hymn = self.rows[index.row()]
        value = hymn[COLUMNS[index.column()][1]]
        if role == SORT_ROLE:
            return value if not isinstance(value, str) else value.casefold()
        if role == Qt.ItemDataRole.DisplayRole:
            if COLUMNS[index.column()][1] == "is_familiar":
                return "★ familiar" if value else ""
            if COLUMNS[index.column()][1] == "timing_verified":
                return "verified" if value else "not verified"
            return value
        if role == Qt.ItemDataRole.TextAlignmentRole and index.column() == 0:
            return int(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        return None


class HymnFilter(QSortFilterProxyModel):
    """Search text (number, title, tune, first line) + status + familiar-only."""

    def __init__(self):
        super().__init__()
        self.text, self.status, self.familiar_only = "", None, False
        self.setSortRole(SORT_ROLE)

    def set_filter(self, text=None, status=..., familiar_only=None):
        if text is not None:
            self.text = text.casefold().strip()
        if status is not ...:
            self.status = status
        if familiar_only is not None:
            self.familiar_only = familiar_only
        self.invalidateFilter()

    def filterAcceptsRow(self, row, parent):
        h = self.sourceModel().rows[row]
        if self.status and h["status"] != self.status:
            return False
        if self.familiar_only and not h["is_familiar"]:
            return False
        if not self.text:
            return True
        hay = f"{h['number']} {h['title']} {h['tune'] or ''} {h['first_line'] or ''}".casefold()
        return all(word in hay for word in self.text.split())


class HymnsPage(ui.Page):
    def __init__(self, win):
        super().__init__(win, "Hymns")
        self.loaded = False
        self.current = None        # the selected hymn's row (dict)
        self.saved_state = None    # form state as loaded, to detect unsaved edits
        self.abc_cache = {}
        self.pending_select = None

        split = QSplitter()
        self.body.addWidget(split, 1)

        # ---------- left: search + table
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 8, 0)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Search number, title, tune, or first line…")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(lambda t: self.proxy.set_filter(text=t))
        ll.addWidget(self.search)
        filters = QHBoxLayout()
        self.status_filter = QComboBox()
        self.status_filter.addItems(["All statuses", *data.STATUSES])
        self.status_filter.currentIndexChanged.connect(
            lambda i: self.proxy.set_filter(status=None if i == 0 else data.STATUSES[i - 1]))
        filters.addWidget(self.status_filter)
        self.familiar_filter = QCheckBox("Familiar only")
        self.familiar_filter.toggled.connect(lambda on: self.proxy.set_filter(familiar_only=on))
        filters.addWidget(self.familiar_filter)
        filters.addStretch()
        self.count = ui.label("", "muted")
        filters.addWidget(self.count)
        ll.addLayout(filters)

        self.model = HymnModel()
        self.proxy = HymnFilter()
        self.proxy.setSourceModel(self.model)
        self.proxy.rowsInserted.connect(self._update_count)
        self.proxy.rowsRemoved.connect(self._update_count)
        self.proxy.modelReset.connect(self._update_count)
        self.proxy.layoutChanged.connect(self._update_count)
        self.table = QTableView()
        self.table.setModel(self.proxy)
        self.table.setSortingEnabled(True)
        self.table.sortByColumn(0, Qt.SortOrder.AscendingOrder)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setAlternatingRowColors(True)
        self.table.verticalHeader().hide()
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        for c in (0, 2, 3, 4):
            self.table.horizontalHeader().setSectionResizeMode(c, QHeaderView.ResizeMode.ResizeToContents)
        self.table.selectionModel().currentRowChanged.connect(self._row_changed)
        ll.addWidget(self.table, 1)
        split.addWidget(left)

        # ---------- right: details
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        detail = QWidget()
        self.detail = detail
        dl = QVBoxLayout(detail)
        dl.setContentsMargins(8, 0, 8, 0)
        self.heading = ui.label("Select a hymn", "sectionTitle", wrap=True)
        dl.addWidget(self.heading)
        self.subheading = ui.label("", "muted", wrap=True)
        dl.addWidget(self.subheading)

        form = QFormLayout()
        self.f_title, self.f_tune, self.f_first, self.f_meter = QLineEdit(), QLineEdit(), QLineEdit(), QLineEdit()
        self.f_notes = QPlainTextEdit()
        self.f_notes.setFixedHeight(60)
        self.f_familiar = QCheckBox("Familiar (gets audio; shown in Sing a Hymn)")
        self.f_status = ui.status_combo()
        form.addRow("Title", self.f_title)
        form.addRow("Tune", self.f_tune)
        form.addRow("First line", self.f_first)
        form.addRow("Meter", self.f_meter)
        form.addRow("", self.f_familiar)
        form.addRow("Status", self.f_status)
        form.addRow("Notes", self.f_notes)
        dl.addLayout(form)

        # Audio preview
        dl.addWidget(ui.label("Audio", "sectionTitle"))
        audio_row = QHBoxLayout()
        self.play_btn = QPushButton("▶ Play")
        self.play_btn.clicked.connect(self._toggle_play)
        audio_row.addWidget(self.play_btn)
        self.audio_status = ui.label("", "muted")
        audio_row.addWidget(self.audio_status, 1)
        dl.addLayout(audio_row)
        self.player = QMediaPlayer()
        self.audio_out = QAudioOutput()
        self.audio_out.setVolume(0.8)
        self.player.setAudioOutput(self.audio_out)
        self.player.playbackStateChanged.connect(self._playback_changed)
        self.player.errorOccurred.connect(lambda _e, msg: self.audio_status.setText(f"Can't play: {msg}"))

        # Scripture references
        dl.addWidget(ui.label("Scripture references", "sectionTitle"))
        self.refs = QTableWidget(0, 4)
        self.refs.setHorizontalHeaderLabels(["Book", "Chapter", "From verse", "To verse"])
        self.refs.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.refs.verticalHeader().hide()
        self.refs.setMinimumHeight(140)
        dl.addWidget(self.refs)
        ref_btns = QHBoxLayout()
        add_ref = QPushButton("Add reference")
        add_ref.clicked.connect(lambda: self._add_ref_row(("PSA", 1, None, None)))
        del_ref = QPushButton("Remove selected")
        del_ref.clicked.connect(lambda: self._remove_selected(self.refs))
        ref_btns.addWidget(add_ref)
        ref_btns.addWidget(del_ref)
        ref_btns.addWidget(ui.label("Leave verses blank for a whole chapter.", "muted"))
        ref_btns.addStretch()
        dl.addLayout(ref_btns)

        # Topics
        dl.addWidget(ui.label("Topics", "sectionTitle"))
        self.topics = QTableWidget(0, 2)
        self.topics.setHorizontalHeaderLabels(["Topic", "Stanzas (blank = all)"])
        self.topics.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.topics.verticalHeader().hide()
        self.topics.setMinimumHeight(140)
        dl.addWidget(self.topics)
        topic_btns = QHBoxLayout()
        self.topic_pick = QComboBox()
        self.topic_pick.setEditable(True)
        self.topic_pick.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.topic_pick.lineEdit().setPlaceholderText("Topic name (pick or type a new one)")
        topic_btns.addWidget(self.topic_pick, 1)
        add_topic = QPushButton("Add topic")
        add_topic.clicked.connect(self._add_topic_from_picker)
        del_topic = QPushButton("Remove selected")
        del_topic.clicked.connect(lambda: self._remove_selected(self.topics))
        topic_btns.addWidget(add_topic)
        topic_btns.addWidget(del_topic)
        dl.addLayout(topic_btns)

        # ABC source (read-only)
        dl.addWidget(ui.label("ABC source (read-only)", "sectionTitle"))
        self.abc = QPlainTextEdit()
        self.abc.setReadOnly(True)
        self.abc.setFont(QFontDatabase.systemFont(QFontDatabase.SystemFont.FixedFont))
        self.abc.setMinimumHeight(220)
        dl.addWidget(self.abc)

        scroll.setWidget(detail)
        right = QWidget()
        rl = QVBoxLayout(right)
        rl.setContentsMargins(0, 0, 0, 0)
        rl.addWidget(scroll, 1)
        save_row = QHBoxLayout()
        save_row.addStretch()
        self.revert_btn = QPushButton("Revert")
        self.revert_btn.clicked.connect(lambda: self._load_detail(self.current))
        self.save_btn = QPushButton("Save changes")
        self.save_btn.setObjectName("primary")
        self.save_btn.clicked.connect(self._save)
        save_row.addWidget(self.revert_btn)
        save_row.addWidget(self.save_btn)
        rl.addLayout(save_row)
        split.addWidget(right)
        split.setSizes([520, 680])
        self.detail.setEnabled(False)
        self.save_btn.setEnabled(False)
        self.revert_btn.setEnabled(False)

    # ------------------------------------------------------------ loading

    def refresh(self):
        if not self.loaded:
            self.win.run(self.win.data.hymns, on_done=self._got_hymns, message="Loading hymns…")
            self.win.run(self.win.data.topic_names, on_done=self._got_topics, message="Loading topics…")

    def _got_hymns(self, rows):
        keep = self.pending_select or (self.current["id"] if self.current else None)
        self.pending_select = None
        self.model.set_rows(rows)
        self.loaded = True
        if keep:
            self.select(keep)
        self._update_count()

    def _got_topics(self, names):
        self.topic_pick.clear()
        self.topic_pick.addItems(names)
        self.topic_pick.setCurrentText("")

    def _update_count(self, *_):
        self.count.setText(f"{self.proxy.rowCount()} of {self.model.rowCount()}")

    def select(self, row_id):
        """Select a hymn by id, clearing filters if they hide it."""
        if not self.loaded:
            self.pending_select = row_id  # refresh() is already loading; select when it arrives
            return
        src_row = self.model.row_of(row_id)
        if src_row < 0:
            return
        idx = self.proxy.mapFromSource(self.model.index(src_row, 0))
        if not idx.isValid():
            self.search.clear()
            self.status_filter.setCurrentIndex(0)
            self.familiar_filter.setChecked(False)
            idx = self.proxy.mapFromSource(self.model.index(src_row, 0))
        self.table.setCurrentIndex(idx)
        self.table.scrollTo(idx, QAbstractItemView.ScrollHint.PositionAtCenter)

    def _row_changed(self, current, previous):
        if not current.isValid():
            return
        hymn = self.model.rows[self.proxy.mapToSource(current).row()]
        if self.current and hymn["id"] == self.current["id"]:
            return
        if self._dirty() and not ui.confirm(self, "Discard unsaved changes to this hymn?"):
            # Put the selection back without re-triggering this handler.
            self.table.selectionModel().blockSignals(True)
            self.table.setCurrentIndex(previous)
            self.table.selectionModel().blockSignals(False)
            return
        self._load_detail(hymn)

    def _load_detail(self, hymn):
        if hymn is None:
            return
        self.current = hymn
        self.player.stop()
        self.detail.setEnabled(False)
        self.save_btn.setEnabled(False)
        self.revert_btn.setEnabled(False)
        self.heading.setText(f"#{hymn['number']}  {hymn['title']}")
        timing = "lyric timing verified" if hymn["timing_verified"] else "lyric timing NOT verified (words show without highlighting)"
        self.subheading.setText(f"{hymn['stanza_count'] or '?'} stanzas · {timing}")
        self.f_title.setText(hymn["title"] or "")
        self.f_tune.setText(hymn["tune"] or "")
        self.f_first.setText(hymn["first_line"] or "")
        self.f_meter.setText(hymn["meter"] or "")
        self.f_notes.setPlainText(hymn["notes"] or "")
        self.f_familiar.setChecked(bool(hymn["is_familiar"]))
        self.f_status.setCurrentText(hymn["status"])
        self.play_btn.setEnabled(bool(hymn["audio_path"]))
        self.audio_status.setText("" if hymn["audio_path"] else "No audio uploaded (only familiar hymns get audio by default).")
        self.refs.setRowCount(0)
        self.topics.setRowCount(0)
        self.abc.setPlainText("Loading…")

        hymn_id = hymn["id"]

        def load(d=self.win.data):
            return d.hymn_refs(hymn_id), d.hymn_topics(hymn_id)

        self.win.run(load, on_done=lambda res: self._got_detail(hymn_id, *res), message="Loading hymn…")
        if hymn["abc_path"] in self.abc_cache:
            self.abc.setPlainText(self.abc_cache[hymn["abc_path"]])
        elif hymn["abc_path"]:
            path = hymn["abc_path"]
            self.win.run(self.win.data.fetch_text, "hymn-abc", path,
                         on_done=lambda text: self._got_abc(hymn_id, path, text), message="Loading ABC…")
        else:
            self.abc.setPlainText("(no ABC file)")

    def _got_detail(self, hymn_id, refs, topics):
        if not self.current or self.current["id"] != hymn_id:
            return  # the user moved on while this was loading
        for r in refs:
            self._add_ref_row(r)
        for name, stanzas in topics:
            self._add_topic_row(name, stanzas)
        self.saved_state = self._form_state()
        self.detail.setEnabled(True)
        self.save_btn.setEnabled(True)
        self.revert_btn.setEnabled(True)

    def _got_abc(self, hymn_id, path, text):
        self.abc_cache[path] = text
        if self.current and self.current["id"] == hymn_id:
            self.abc.setPlainText(text)

    # ------------------------------------------------------------ refs + topics tables

    def _add_ref_row(self, ref):
        book, chapter, vs, ve = ref
        r = self.refs.rowCount()
        self.refs.insertRow(r)
        combo = QComboBox()
        for code, name, _ in BOOKS:
            combo.addItem(f"{name} ({code})", code)
        i = combo.findData(book)
        if i < 0:  # an unknown code from the source data: show it so it can be fixed
            combo.addItem(f"{book} (unknown)", book)
            i = combo.count() - 1
        combo.setCurrentIndex(i)
        self.refs.setCellWidget(r, 0, combo)
        for col, value in ((1, chapter), (2, vs), (3, ve)):
            self.refs.setItem(r, col, QTableWidgetItem("" if value is None else str(value)))

    def _add_topic_row(self, name, stanzas):
        r = self.topics.rowCount()
        self.topics.insertRow(r)
        item = QTableWidgetItem(name)
        item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
        self.topics.setItem(r, 0, item)
        self.topics.setItem(r, 1, QTableWidgetItem(stanzas or ""))

    def _add_topic_from_picker(self):
        name = self.topic_pick.currentText().strip()
        existing = {self.topics.item(r, 0).text() for r in range(self.topics.rowCount())}
        if name and name not in existing:
            self._add_topic_row(name, None)
        self.topic_pick.setCurrentText("")

    @staticmethod
    def _remove_selected(table):
        for r in sorted({i.row() for i in table.selectedIndexes()} | ({table.currentRow()} - {-1}), reverse=True):
            table.removeRow(r)

    def _read_refs(self):
        """[(book, chapter, vs, ve)] from the table; raises ValueError on bad numbers."""
        refs = []
        for r in range(self.refs.rowCount()):
            book = self.refs.cellWidget(r, 0).currentData()

            def num(col, required=False):
                text = (self.refs.item(r, col).text() if self.refs.item(r, col) else "").strip()
                if not text:
                    if required:
                        raise ValueError(f"Reference row {r + 1}: chapter is required.")
                    return None
                if not text.isdigit():
                    raise ValueError(f"Reference row {r + 1}: '{text}' is not a number.")
                return int(text)

            chapter, vs, ve = num(1, True), num(2), num(3)
            if vs is not None and ve is None:
                ve = vs  # a single verse
            refs.append((book, chapter, vs, ve))
        return refs

    def _read_topics(self):
        return sorted((self.topics.item(r, 0).text(), (self.topics.item(r, 1).text().strip() or None)
                       if self.topics.item(r, 1) else None) for r in range(self.topics.rowCount()))

    # ------------------------------------------------------------ saving

    def _form_state(self):
        try:
            refs = sorted(self._read_refs(), key=str)
        except ValueError:
            refs = "invalid"
        return {
            "title": self.f_title.text().strip(), "tune": self.f_tune.text().strip() or None,
            "first_line": self.f_first.text().strip() or None, "meter": self.f_meter.text().strip() or None,
            "notes": self.f_notes.toPlainText().strip() or None, "is_familiar": self.f_familiar.isChecked(),
            "status": self.f_status.currentText(), "refs": refs, "topics": self._read_topics(),
        }

    def _dirty(self):
        return self.saved_state is not None and self.detail.isEnabled() and self._form_state() != self.saved_state

    def _save(self):
        if not self.current:
            return
        try:
            refs = self._read_refs()
        except ValueError as e:
            ui.error(self, str(e))
            return
        state = self._form_state()
        old = self.saved_state
        hymn_id = self.current["id"]
        fields = {k: state[k] for k in ("title", "tune", "first_line", "meter", "notes", "is_familiar")
                  if state[k] != old[k]}
        status = state["status"] if state["status"] != old["status"] else None
        refs_changed = state["refs"] != old["refs"]
        topics = state["topics"] if state["topics"] != old["topics"] else None
        if not (fields or status or refs_changed or topics is not None):
            self.win.statusBar().showMessage("No changes to save.", 3000)
            return

        def save(d=self.win.data):
            # Each call below writes its own audit_log row.
            if fields:
                d.update_hymn(hymn_id, fields)
            if refs_changed:
                d.set_hymn_refs(hymn_id, refs)
            if topics is not None:
                d.set_hymn_topics(hymn_id, topics)
            if status:
                d.set_status("hymns", hymn_id, status)
            return next(h for h in d.hymns() if h["id"] == hymn_id)

        self.save_btn.setEnabled(False)

        def saved(hymn):
            self.model.update_row(hymn)
            self.saved_state = None
            self._load_detail(hymn)
            self.win.statusBar().showMessage(f"Saved #{hymn['number']} {hymn['title']}.", 4000)
            if topics is not None:
                self.win.run(self.win.data.topic_names, on_done=self._got_topics)

        def failed_reload(*_):
            self.save_btn.setEnabled(True)

        w = self.win.run(save, on_done=saved, message="Saving…")
        w.failed.connect(failed_reload)

    # ------------------------------------------------------------ audio

    def _toggle_play(self):
        if self.player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
            self.player.stop()
            return
        url = self.win.data.public_url("hymn-audio", self.current["audio_path"])
        if self.player.source() != QUrl(url):
            self.player.setSource(QUrl(url))
        self.audio_status.setText("Loading…")
        self.player.play()

    def _playback_changed(self, state):
        playing = state == QMediaPlayer.PlaybackState.PlayingState
        self.play_btn.setText("■ Stop" if playing else "▶ Play")
        if playing:
            self.audio_status.setText("Playing (streamed from Storage)")
        elif self.audio_status.text().startswith(("Loading", "Playing")):
            self.audio_status.setText("")

    def hideEvent(self, event):
        self.player.stop()  # don't keep playing on another page
        super().hideEvent(event)
