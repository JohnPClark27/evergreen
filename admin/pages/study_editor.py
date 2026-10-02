"""StudyEditor: edit one study (hymn -> passage -> prayer) with a live preview.

Used by the Studies page and by the Plans page's "New study…" dialog.
Scripture text is fetched for the preview only and never saved.
"""
import html

from PySide6.QtCore import Qt, QUrl, Signal
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtWidgets import (
    QCheckBox, QComboBox, QFormLayout, QHBoxLayout, QLineEdit, QListWidget, QListWidgetItem,
    QPushButton, QSpinBox, QSplitter, QTextBrowser, QVBoxLayout, QWidget,
)

import data
import ui
from books import BOOKS, CHAPTERS, ref_label

MAX_VERSE = 176  # Psalm 119; YouVersion reports anything past a chapter's end as missing


class StudyEditor(QWidget):
    saved = Signal(dict)  # the study row after a successful save

    def __init__(self, win):
        super().__init__()
        self.win = win
        self.study = None            # row being edited, or None for a new study
        self.hymns, self.prayers = [], []
        self.saved_state = None
        self.title_touched = False
        self.preview_token = 0       # ignore preview results for an older selection

        split = QSplitter()
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.addWidget(split)

        # ---------------------------------------------------------- form
        form_box = QWidget()
        fl = QVBoxLayout(form_box)
        fl.setContentsMargins(0, 0, 8, 0)
        self.heading = ui.label("New study", "sectionTitle")
        fl.addWidget(self.heading)
        form = QFormLayout()

        self.f_title = QLineEdit()
        self.f_title.textEdited.connect(lambda _: setattr(self, "title_touched", True))
        form.addRow("Title", self.f_title)

        # Hymn picker: search + familiar filter + list
        hymn_box = QVBoxLayout()
        row = QHBoxLayout()
        self.hymn_search = QLineEdit()
        self.hymn_search.setPlaceholderText("Search hymns…")
        self.hymn_search.setClearButtonEnabled(True)
        self.hymn_search.textChanged.connect(self._fill_hymns)
        row.addWidget(self.hymn_search, 1)
        self.familiar_only = QCheckBox("Familiar only")
        self.familiar_only.setChecked(True)
        self.familiar_only.toggled.connect(self._fill_hymns)
        row.addWidget(self.familiar_only)
        hymn_box.addLayout(row)
        self.hymn_list = QListWidget()
        self.hymn_list.setMaximumHeight(150)
        self.hymn_list.currentItemChanged.connect(self._hymn_picked)
        hymn_box.addWidget(self.hymn_list)
        self.hymn_label = ui.label("No hymn chosen", "muted")
        hymn_box.addWidget(self.hymn_label)
        form.addRow("Hymn", hymn_box)

        # Passage picker + suggestions from the hymn's scripture refs
        passage = QHBoxLayout()
        self.f_book = QComboBox()
        for code, name, _ in BOOKS:
            self.f_book.addItem(name, code)
        self.f_book.currentIndexChanged.connect(self._book_changed)
        self.f_chapter, self.f_from, self.f_to = QSpinBox(), QSpinBox(), QSpinBox()
        self.f_chapter.setPrefix("ch. ")
        self.f_from.setPrefix("v. ")
        self.f_to.setPrefix("to ")
        for spin in (self.f_from, self.f_to):
            spin.setRange(1, MAX_VERSE)
        self.f_from.valueChanged.connect(lambda v: self.f_to.setValue(max(v, self.f_to.value())))
        for w in (self.f_book, self.f_chapter, self.f_from, self.f_to):
            passage.addWidget(w)
        for spin in (self.f_chapter, self.f_from, self.f_to):
            spin.valueChanged.connect(self._auto_title)
        form.addRow("Passage", passage)
        self.suggest_box = QHBoxLayout()
        self.suggest_box.setSpacing(12)
        form.addRow("Suggested", self.suggest_box)

        self.f_prayer = QComboBox()
        form.addRow("Prayer", self.f_prayer)

        note = QVBoxLayout()
        self.f_note = QLineEdit()
        self.f_note.setMaxLength(data.AIDE_NOTE_MAX)
        self.f_note.setPlaceholderText("Optional short note for the aide (not shown to the resident)")
        self.note_count = ui.label("", "muted")
        self.f_note.textChanged.connect(lambda t: self.note_count.setText(f"{len(t)}/{data.AIDE_NOTE_MAX}"))
        note.addWidget(self.f_note)
        note.addWidget(self.note_count)
        form.addRow("Aide note", note)

        self.f_status = ui.status_combo()
        form.addRow("Status", self.f_status)
        fl.addLayout(form)
        fl.addStretch()

        btns = QHBoxLayout()
        btns.addStretch()
        self.revert_btn = QPushButton("Revert")
        self.revert_btn.clicked.connect(lambda: self.load(self.study))
        self.save_btn = QPushButton("Save study")
        self.save_btn.setObjectName("primary")
        self.save_btn.clicked.connect(self._save)
        btns.addWidget(self.revert_btn)
        btns.addWidget(self.save_btn)
        fl.addLayout(btns)
        split.addWidget(form_box)

        # ---------------------------------------------------------- preview
        prev = QWidget()
        pl = QVBoxLayout(prev)
        pl.setContentsMargins(8, 0, 0, 0)
        head = QHBoxLayout()
        head.addWidget(ui.label("Preview: what the resident sees", "sectionTitle"))
        head.addStretch()
        self.play_btn = QPushButton("▶ Play hymn")
        self.play_btn.clicked.connect(self._toggle_play)
        head.addWidget(self.play_btn)
        refresh = QPushButton("Refresh preview")
        refresh.clicked.connect(self.refresh_preview)
        head.addWidget(refresh)
        pl.addLayout(head)
        self.preview = QTextBrowser()
        pl.addWidget(self.preview, 1)
        split.addWidget(prev)
        split.setSizes([520, 560])

        self.player = QMediaPlayer(self)  # parented: deleted with this widget
        self.audio_out = QAudioOutput(self)
        self.player.setAudioOutput(self.audio_out)
        self.player.playbackStateChanged.connect(
            lambda s: self.play_btn.setText("■ Stop" if s == QMediaPlayer.PlaybackState.PlayingState
                                            else "▶ Play hymn"))
        self._book_changed()

    # ------------------------------------------------------------ data in

    def set_choices(self, hymns, prayers):
        """Hymns and prayers to pick from (loaded by the page)."""
        self.hymns, self.prayers = hymns, prayers
        self.f_prayer.blockSignals(True)
        self.f_prayer.clear()
        self.f_prayer.addItem("(choose a prayer)", None)
        for p in prayers:
            self.f_prayer.addItem(f"{p['title']}  ·  {p['status']}", p["id"])
        self.f_prayer.blockSignals(False)
        self._fill_hymns()

    def load(self, study):
        """Show a study (dict from data.studies()) or a blank new one (None)."""
        self.player.stop()
        self.study = study
        s = study or {}
        self.heading.setText(s.get("title") or "New study")
        self.title_touched = study is not None
        self.f_title.setText(s.get("title") or "")
        self.chosen_hymn = s.get("hymn_id")
        if self.chosen_hymn and not any(h["id"] == self.chosen_hymn and h["is_familiar"] for h in self.hymns):
            self.familiar_only.setChecked(False)  # make sure the chosen hymn is listed
        self.hymn_search.clear()
        self._fill_hymns()
        self._set_passage(s.get("book") or "PSA", s.get("chapter") or 23, s.get("verse_start") or 1,
                          s.get("verse_end") or s.get("verse_start") or 1)
        self.f_prayer.setCurrentIndex(max(0, self.f_prayer.findData(s.get("prayer_id"))))
        self.f_note.setText(s.get("aide_note") or "")
        self.f_status.setCurrentText(s.get("status") or "draft")
        self._show_hymn_label()
        self._load_suggestions()
        self.saved_state = self._state()
        self.refresh_preview()

    # ------------------------------------------------------------ hymn picker

    def _fill_hymns(self, *_):
        words = self.hymn_search.text().casefold().split()
        self.hymn_list.blockSignals(True)
        self.hymn_list.clear()
        for h in self.hymns:
            if self.familiar_only.isChecked() and not h["is_familiar"] and h["id"] != getattr(self, "chosen_hymn", None):
                continue
            hay = f"{h['number']} {h['title']} {h['first_line'] or ''}".casefold()
            if not all(w in hay for w in words):
                continue
            flag = "★ " if h["is_familiar"] else ""
            item = QListWidgetItem(f"#{h['number']}  {flag}{h['title']}  ·  {h['status']}")
            item.setData(Qt.ItemDataRole.UserRole, h["id"])
            self.hymn_list.addItem(item)
            if h["id"] == getattr(self, "chosen_hymn", None):
                self.hymn_list.setCurrentItem(item)
        self.hymn_list.blockSignals(False)

    def _hymn_picked(self, item, _prev):
        if item is None:
            return
        self.chosen_hymn = item.data(Qt.ItemDataRole.UserRole)
        self._show_hymn_label()
        self._load_suggestions()
        self._auto_title()
        self.player.stop()

    def _hymn(self):
        return next((h for h in self.hymns if h["id"] == getattr(self, "chosen_hymn", None)), None)

    def _show_hymn_label(self):
        h = self._hymn()
        self.hymn_label.setText(f"Chosen: #{h['number']} {h['title']} ({h['status']})" if h else "No hymn chosen")
        self.play_btn.setEnabled(bool(h and h["audio_path"]))

    def _load_suggestions(self):
        """Buttons for the chosen hymn's scripture refs (verse ranges set the passage)."""
        while self.suggest_box.count():
            w = self.suggest_box.takeAt(0).widget()
            if w:
                w.deleteLater()
        h = self._hymn()
        if not h:
            self.suggest_box.addWidget(ui.label("Pick a hymn to see its scripture references.", "muted"))
            return
        hymn_id = h["id"]
        self.win.run(self.win.data.hymn_refs, hymn_id, on_done=lambda refs: self._show_suggestions(hymn_id, refs),
                     message="Loading hymn references…")

    def _show_suggestions(self, hymn_id, refs):
        if getattr(self, "chosen_hymn", None) != hymn_id:
            return
        while self.suggest_box.count():
            w = self.suggest_box.takeAt(0).widget()
            if w:
                w.deleteLater()
        if not refs:
            self.suggest_box.addWidget(ui.label("This hymn has no scripture references.", "muted"))
        for book, chapter, vs, ve in refs[:6]:
            if data.check_ref(book, chapter, vs, ve):
                continue  # skip broken source refs (they're on the dashboard)
            text = ref_label(book, chapter, vs, ve) + ("" if vs else " (pick verses)")
            btn = QPushButton(text)
            btn.setObjectName("link")
            btn.setToolTip("Use this passage")
            btn.clicked.connect(lambda _=False, r=(book, chapter, vs, ve or vs): self._set_passage(
                r[0], r[1], r[2] or 1, r[3] or self.f_from.value()))
            self.suggest_box.addWidget(btn)
        self.suggest_box.addStretch()

    # ------------------------------------------------------------ passage

    def _book_changed(self, *_):
        book = self.f_book.currentData()
        self.f_chapter.setRange(1, CHAPTERS[book])
        self._auto_title()

    def _set_passage(self, book, chapter, vs, ve):
        self.f_book.setCurrentIndex(max(0, self.f_book.findData(book)))
        self.f_chapter.setValue(chapter)
        self.f_from.setValue(vs)
        self.f_to.setValue(ve)
        self._auto_title()

    def _passage(self):
        return self.f_book.currentData(), self.f_chapter.value(), self.f_from.value(), self.f_to.value()

    def _auto_title(self, *_):
        if self.title_touched:
            return
        h = self._hymn()
        ref = ref_label(*self._passage())
        self.f_title.setText(f"{h['title']} · {ref}" if h else ref)

    # ------------------------------------------------------------ saving

    def _state(self):
        book, chapter, vs, ve = self._passage()
        return {
            "title": self.f_title.text().strip(), "hymn_id": getattr(self, "chosen_hymn", None),
            "book": book, "chapter": chapter, "verse_start": vs, "verse_end": ve,
            "prayer_id": self.f_prayer.currentData(), "aide_note": self.f_note.text().strip() or None,
            "status": self.f_status.currentText(),
        }

    def dirty(self):
        return self.saved_state is not None and self._state() != self.saved_state

    def _save(self):
        state = self._state()
        status = state.pop("status")
        try:
            data.check_study(state)
            if status == "published" and not (state["hymn_id"] and state["prayer_id"]):
                raise ValueError("Choose a hymn and a prayer before publishing.")
        except ValueError as e:
            ui.error(self, str(e))
            return
        study_id = self.study["id"] if self.study else None
        old = self.saved_state

        def save(d=self.win.data):
            if study_id is None:
                return d.study(d.create_study({**state, "status": status})["id"])
            fields = {k: v for k, v in state.items() if v != old[k]}
            if fields:
                d.update_study(study_id, fields)
            if status != old["status"]:
                d.set_status("studies", study_id, status)
            return d.study(study_id)

        def done(study):
            self.load(study)
            self.win.statusBar().showMessage(f"Saved study “{study['title']}”.", 4000)
            self.saved.emit(study)

        self.win.run(save, on_done=done, message="Saving study…")

    # ------------------------------------------------------------ preview

    def refresh_preview(self):
        """Fetch hymn words + Scripture (live, not stored) and draw the three steps."""
        self.preview_token += 1
        token = self.preview_token
        h = self._hymn()
        book, chapter, vs, ve = self._passage()
        prayer = next((p for p in self.prayers if p["id"] == self.f_prayer.currentData()), None)
        note = self.f_note.text().strip()
        self.preview.setHtml("<p style='color:gray'>Loading preview…</p>")

        def fetch(d=self.win.data):
            stanzas = d.hymn_stanzas(h["timing_path"]) if h else []
            try:
                passage, passage_error = d.passage_preview(book, chapter, vs, ve), None
            except Exception as e:  # noqa: BLE001 - shown in the preview, not a dialog
                passage, passage_error = None, str(e)
            return stanzas, passage, passage_error

        def show(result):
            if token == self.preview_token:
                self.preview.setHtml(render_preview(h, (book, chapter, vs, ve), prayer, note, *result))

        self.win.run(fetch, on_done=show, message="Building preview…")

    def _toggle_play(self):
        h = self._hymn()
        if self.player.playbackState() == QMediaPlayer.PlaybackState.PlayingState or not h:
            self.player.stop()
            return
        self.player.setSource(QUrl(self.win.data.public_url("hymn-audio", h["audio_path"])))
        self.player.play()

    def hideEvent(self, event):
        self.player.stop()
        super().hideEvent(event)


def render_preview(hymn, passage_ref, prayer, note, stanzas, passage, passage_error):
    """HTML for the preview pane, styled after the public app's session card."""
    e = html.escape
    ink, muted, accent, hl = "#221E19", "#5A5248", "#7A2533", "#F6E1A6"
    out = [f"<div style='font-family:Georgia,serif;color:{ink};font-size:15px'>"]

    def step(n, name):
        out.append(f"<p style='color:{accent};font-weight:bold;margin-top:18px'>{n} · {name}</p>")

    step(1, "Hymn")
    if hymn:
        out.append(f"<h2 style='margin:0'>{e(hymn['title'])}</h2>")
        out.append(f"<p style='color:{muted}'>Based on {e(ref_label(*passage_ref))}"
                   + ("" if hymn["timing_verified"] else " · words without highlighting (timing not verified)") + "</p>")
        for i, lines in enumerate(stanzas):
            bg = f"background:{hl};" if i == 0 else ""
            out.append(f"<p style='{bg}font-size:17px'><span style='color:{muted}'>Verse {i + 1} of {len(stanzas)}</span><br>"
                       + "<br>".join(e(line) for line in lines) + "</p>")
        if not stanzas:
            out.append(f"<p style='color:{muted}'>(no words available)</p>")
    else:
        out.append(f"<p style='color:{muted}'>No hymn chosen.</p>")

    step(2, "Scripture")
    out.append(f"<h3 style='margin:0'>{e(ref_label(*passage_ref))}</h3>"
               f"<p style='color:{muted}'>Reading aloud · Slow</p>")
    if passage:
        for num, text in passage["verses"]:
            out.append(f"<p style='font-size:17px'><sup style='color:{muted}'>{num}</sup> {e(text)}</p>")
        if not passage["verses"]:
            out.append(f"<p style='color:{muted}'>No verses found: check the verse numbers.</p>")
        out.append(f"<p style='color:{muted};font-size:12px'>{e(passage['attribution'])}</p>")
    else:
        out.append(f"<p style='color:{muted}'>{e(passage_error or '')}</p>")

    step(3, "Prayer")
    if prayer:
        out.append(f"<h3 style='margin:0'>{e(prayer['title'])}</h3>")
        out.append("<p style='font-size:17px;text-align:center'>" + e(prayer["text"]).replace("\n", "<br>") + "</p>")
        line = prayer.get("attribution") or prayer["source"]
        out.append(f"<p style='color:{muted};font-size:12px;text-align:center'>{e(line)}</p>")
    else:
        out.append(f"<p style='color:{muted}'>No prayer chosen.</p>")

    if note:
        out.append(f"<p style='border:1px solid #CFC3AE;padding:6px;color:{muted}'><b>Aide note:</b> {e(note)}</p>")
    out.append("</div>")
    return "".join(out)
