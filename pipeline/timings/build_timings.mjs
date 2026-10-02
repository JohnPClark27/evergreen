// build_timings.mjs - when is each word sung in each hymn MP3?
// Ported from v1 (scripts/build_lyric_timings.mjs); the alignment logic is unchanged.
//
// The MP3s are made by pipeline/render_mp3.sh:
//   ABC --mk-abc-for-midi--> expanded ABC (intro + one pass per stanza, lyrics stripped)
//       --abc2midi--> MIDI --fluidsynth--> WAV (trailing silence trimmed) --> MP3
// So the MIDI is an exact map of the audio. We rebuild that MIDI the same way,
// take the melody's note-on times, and pair them with the syllables written
// under the melody in the original ABC (w: lines).
//
// abcjs parses the ABC here AND draws the sheet music in the browser, so
// noteTimes[stanza][j] lines up with melody note j on screen. Don't swap the parser.
//
// Usage:  node build_timings.mjs <manifest.json>
//   manifest: [{ number, title, tune, abc: <path>, mp3: <path|null>, out: <path> }]
//   Writes each hymn's JSON (timings + ABC text) to `out`, and prints one JSON line
//   per hymn to stdout: { number, synced, reason, stanzaCount, firstLine }.
// Needs abc2midi on PATH and the Open Hymnal repo (OPENHYMNAL_DIR, default ~/openhymnal).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import abcjs from 'abcjs';
import tonejsMidi from '@tonejs/midi';

const { Midi } = tonejsMidi;
const OH = path.resolve((process.env.OPENHYMNAL_DIR ?? path.join(os.homedir(), 'openhymnal')).replace(/^~(?=\/|$)/, os.homedir()));
const env = { ...process.env, PATH: `${OH}/bin:${process.env.PATH}` }; // mk-abc-for-midi needs ohroot

// Some Open Hymnal files are Windows-1252, not UTF-8. Decode strictly as UTF-8 first.
function readAbc(file) {
  const bytes = fs.readFileSync(file);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

// ---------- Rebuild the MIDI exactly like abc2mp3_v3.sh ----------

function buildMidi(abcPath, tmp) {
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f));
  try { execFileSync('mk-abc-for-midi', [abcPath], { cwd: tmp, env, stdio: 'ignore' }); } catch {}
  const rel = path.relative(OH, abcPath);
  const handbuilt = path.join(OH, 'Build-Midi', rel.replace(/\.abc$/, '-for-midi.abc'));
  let src = abcPath, kind = 'single-pass';
  if (fs.existsSync(path.join(tmp, 'temp.abc')) && fs.statSync(path.join(tmp, 'temp.abc')).size) {
    src = path.join(tmp, 'temp.abc'); kind = 'expanded';
  } else if (fs.existsSync(handbuilt)) {
    src = handbuilt; kind = 'handbuilt';
  }
  try { execFileSync('abc2midi', [src, '-o', path.join(tmp, 't.mid')], { env, stdio: 'ignore' }); } catch {}
  const mid = path.join(tmp, 't.mid');
  if (!fs.existsSync(mid)) throw new Error('abc2midi produced no MIDI');
  return { midi: new Midi(fs.readFileSync(mid)), kind };
}

// Melody note-ons, with the notes of a chord merged into one onset. abc2midi starts a
// chord's notes ~10ms apart (a slight strum), so "together" means within CHORD_WINDOW --
// still far shorter than any real note in these hymns (a 16th at 140bpm is ~110ms).
const CHORD_WINDOW = 0.03;
function melodyOnsets(midi) {
  const track = midi.tracks.find((t) => t.notes.length);
  const onsets = [];
  for (const n of [...track.notes].sort((a, b) => a.time - b.time || a.midi - b.midi)) {
    const last = onsets.at(-1);
    if (last && n.time - last.t < CHORD_WINDOW) {
      last.pitches.push(n.midi);
      last.dur = Math.max(last.dur, n.duration);
    } else {
      onsets.push({ t: n.time, pitches: [n.midi], dur: n.duration });
    }
  }
  return onsets;
}

// ---------- Read the melody + lyrics from the original ABC ----------

// Melody = first voice of the first staff. Each written note says how many MIDI
// onsets it produces: grace notes each sound, a tied continuation doesn't.
function melodyNotes(tune) {
  const notes = [];
  tune.lines.forEach((line, row) => {
    if (!line.staff) return;
    for (const el of line.staff[0].voices[0]) {
      if (el.el_type !== 'note' || el.rest) continue;
      const tiedOn = el.pitches?.some((p) => p.endTie);
      notes.push({ el, row, onsets: (el.gracenotes?.length ?? 0) + (tiedOn ? 0 : 1), tiedOn });
    }
  });
  return notes;
}

// Text-only stanzas after the music, in either format mk-abc-for-midi reads:
//   W: 6.The earth shall soon dissolve like snow,      (ends at a blank "W:")
//   %%begintext ... %% 5.\tYet as the Law ... %%endtext  (literal \t = indent)
function textStanzas(abc) {
  const stanzas = [];
  let cur = null, afterMusic = false, inText = false;
  for (const raw of abc.split(/\r?\n/)) {
    if (/^\[V:/.test(raw)) afterMusic = true;
    let text;
    if (/^%%begintext/.test(raw)) { inText = afterMusic; cur = null; continue; }
    if (/^%%endtext/.test(raw)) { inText = false; cur = null; continue; }
    if (inText) text = raw.replace(/^%%\s?/, '');
    else if (/^W:/.test(raw)) text = raw.replace(/^W:\s?/, '');
    else continue;
    text = text.replace(/\\t/g, ' ').trim();
    if (!text) { cur = null; continue; }
    const num = /^(\d+)\.\s*(.*)$/.exec(text);
    if (num || !cur) { cur = { n: num ? Number(num[1]) : null, lines: [] }; stanzas.push(cur); }
    cur.lines.push(num ? num[2] : text);
  }
  return stanzas;
}

// %OHMETRICAL 8 6 8 6 [D] -> syllables per poetic line, e.g. [8, 6, 8, 6]
function meter(abc) {
  const m = /%OHMETRICAL\s+([^\n]+)/.exec(abc);
  if (!m) return null;
  const nums = (m[1].match(/\d+/g) ?? []).map(Number);
  if (!nums.length) return null;
  return /\bD\b/.test(m[1]) ? [...nums, ...nums] : nums;
}

// Rough English syllable count (vowel groups, minus a silent final e). Only used for W: stanzas.
function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  const groups = w.replace(/(?<!l)e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

// ---------- Pair onsets with syllables ----------

// For one stanza pass: the start time of every written melody note.
// Tied notes (e.g. "G3- | G2") sound as ONE MIDI note, so the continuation has no
// onset of its own. We split that MIDI note's length between the tied notes in
// proportion to their written values: G3-|G2 held for 3s -> the G2 starts at 3s * 3/5.
function noteTimes(notes, passOnsets) {
  const times = [];
  let k = 0;
  for (let j = 0; j < notes.length; j++) {
    const n = notes[j];
    k += n.onsets - (n.tiedOn ? 0 : 1); // skip grace-note onsets
    if (n.tiedOn) continue;             // filled in with its tie chain below
    const onset = passOnsets[k++];
    times[j] = onset.t;
    // Tie chain: this note plus following tied continuations.
    let end = j;
    while (notes[end + 1]?.tiedOn) end++;
    if (end > j) {
      const written = notes.slice(j, end + 1).map((x) => x.el.duration || 1);
      const total = written.reduce((a, b) => a + b, 0);
      let t = onset.t;
      for (let c = j + 1; c <= end; c++) {
        t += onset.dur * (written[c - j - 1] / total);
        times[c] = t;
      }
    }
  }
  // A continuation at the very start (tied from a previous pass) keeps the pass start.
  for (let j = 0; j < notes.length; j++) times[j] ??= times[j - 1] ?? passOnsets[0]?.t ?? 0;
  return times;
}

// Words for stanza `v` from the w: lines: [{ text, t, row, syl }].
// A music row with fewer w: lines than stanzas (e.g. a refrain written once) is
// sung with its last line on every later pass -- the same rule mk-abc-for-midi uses.
// `onlyRows` limits the result to some rows (used for refrains of text-only stanzas).
function alignedWords(notes, times, v, rowLines, onlyRows = null) {
  const words = [];
  let joinNext = false;
  notes.forEach((n, j) => {
    if (onlyRows && !onlyRows.has(n.row)) return;
    const ly = n.el.lyric?.[Math.min(v, rowLines[n.row] - 1)];
    if (!ly) return;
    let s = ly.syllable.replace(/^\d+\.\s*/, '').trim(); // drop the "1." stanza number
    if (!s || s === '*') return;                        // held note, no new syllable
    if (joinNext && words.length) {
      words.at(-1).text += s;
      words.at(-1).syl += 1;
    } else {
      words.push({ text: s, t: times[j], row: n.row, syl: 1 });
    }
    joinNext = ly.divider === '-';
  });
  return words;
}

// Split words into poetic lines by meter when the syllables add up, else by music row.
function toLines(words, met) {
  const total = words.reduce((a, w) => a + w.syl, 0);
  const lines = [];
  if (met && met.reduce((a, b) => a + b, 0) === total) {
    let i = 0;
    for (const count of met) {
      const line = [];
      let got = 0;
      while (i < words.length && got < count) { got += words[i].syl; line.push(words[i++]); }
      lines.push(line);
    }
  } else {
    for (const w of words) {
      if (!lines.length || lines.at(-1).at(-1).row !== w.row) lines.push([]);
      lines.at(-1).push(w);
    }
  }
  return lines.map((l) => l.map(({ text, t }) => ({ text, t: +t.toFixed(3) })));
}

// Text-only stanza: reuse stanza 1's syllable slots (the notes that carry a syllable
// in stanza 1, as { j: note index, t: time }), spread each line's words over that
// line's slots. Words keep their note index `j` so they can be written under the music.
function approxWords(stanza, slots, met) {
  const lines = stanza.lines.map((l) => l.split(/\s+/).filter(Boolean));
  const useMeter = met && met.length === lines.length && met.reduce((a, b) => a + b, 0) === slots.length;
  const groups = useMeter ? met : [slots.length];
  const wordLines = useMeter ? lines : [lines.flat()];
  const out = [];
  let slot0 = 0;
  groups.forEach((slotCount, li) => {
    const ws = wordLines[li];
    const est = ws.map(syllables);
    const estTotal = est.reduce((a, b) => a + b, 0);
    let cum = 0, prev = slot0 - 1;
    const line = ws.map((text, k) => {
      // Proportional position, but always at least one slot after the previous word.
      const guess = slot0 + Math.floor((cum / estTotal) * slotCount);
      const slot = Math.min(slot0 + slotCount - 1, Math.max(prev + 1, guess));
      prev = slot;
      cum += est[k];
      return { text, t: +slots[slot].t.toFixed(3), j: slots[slot].j };
    });
    slot0 += slotCount;
    out.push(line);
  });
  // Without meter we get one long line: re-split on the W: line boundaries for display.
  if (!useMeter) {
    const flat = out[0], split = [];
    let i = 0;
    for (const l of lines) { split.push(flat.slice(i, i + l.length)); i += l.length; }
    return split;
  }
  return out;
}

// ---------- Hymnal pages: at most 5 stanzas under the music per page ----------
//
// Stanzas printed only as text after the music (W: / %%begintext) get written under
// the notes as generated w: lines, using the note each word was assigned to. Page 1
// holds stanzas 1-5, page 2 a copy of the music with stanzas 6-10, and so on.
// Returns [{ abc, stanzas: [stanza indices] }], or null when one page already fits
// (no text-only stanzas) or the ABC's layout isn't one we can safely rewrite.

const STANZAS_PER_PAGE = 5;

// A word as a single w: token: '-', '_', '*', '~', '|' mean something in lyric lines.
const abcToken = (word) => word.replace(/-/g, '\\-').replace(/_/g, '\\_').replace(/[*~|]/g, '');

function buildPages(abc, tune, notes, stanzas, refrainRows) {
  if (!stanzas.some((st) => st.approx)) return null; // no text-only stanzas: the original page is right

  // The melody voice's music lines in the source, one per staff row abcjs found.
  const src = abc.split(/\r?\n/);
  const first = src.map((l) => /^\[V:\s*([^\]\s]+)\s*\]/.exec(l)).find(Boolean);
  if (!first) return null;
  const melodyLine = (l) => l.startsWith(first[0]) || new RegExp(`^\\[V:\\s*${first[1].replace(/\W/g, '\\$&')}\\s*\\]`).test(l);
  const melodyIdx = src.map((l, i) => (melodyLine(l) ? i : -1)).filter((i) => i >= 0);
  const staffRows = tune.lines.map((l, i) => (l.staff ? i : -1)).filter((i) => i >= 0);
  if (melodyIdx.length !== staffRows.length) return null;

  const rowNotes = new Map();
  notes.forEach((n, j) => rowNotes.set(n.row, [...(rowNotes.get(n.row) ?? []), j]));
  const wAfter = (i) => { const out = []; while (/^w:/.test(src[++i] ?? '')) out.push(src[i]); return out; };

  // Generated w: line for text-only stanza p on one music row (null if it has no words there).
  const numbered = new Set();
  function wLine(p, row) {
    const byNote = new Map(stanzas[p].lines.flat().filter((w) => w.j != null).map((w) => [w.j, w.text]));
    let any = false;
    const tokens = (rowNotes.get(row) ?? []).map((j) => {
      if (!byNote.has(j)) return '*';
      let tok = abcToken(byNote.get(j));
      if (!numbered.has(p)) { numbered.add(p); tok = `${stanzas[p].n}.~${tok}`; }
      any = true;
      return tok;
    });
    return any ? `w: ${tokens.join(' ')}` : null;
  }

  // Repeat passes (see build) aren't new words, so they don't get a row on the page.
  const shown = stanzas.map((st, p) => (st.repeatOf == null ? p : -1)).filter((p) => p >= 0);
  const pages = [];
  for (let start = 0; start < shown.length; start += STANZAS_PER_PAGE) {
    const onPage = shown.slice(start, start + STANZAS_PER_PAGE);
    const out = [];
    let afterMusic = false, inText = false, titled = false;
    src.forEach((line, i) => {
      if (/^\[V:/.test(line)) afterMusic = true;
      // Text-only stanzas now live under the notes, so drop them from below the music.
      if (afterMusic && /^%%begintext/.test(line)) { inText = true; return; }
      if (inText) { if (/^%%endtext/.test(line)) inText = false; return; }
      if (/^[Ww]:/.test(line)) return; // w: lines are re-emitted right after each melody line
      if (start > 0 && /^[CS]:/.test(line)) return; // credits only on page 1
      if (start > 0 && /^T:/.test(line)) { if (!titled) out.push(`${line.trimEnd()} (continued)`); titled = true; return; }
      out.push(line);

      const k = melodyIdx.indexOf(i);
      if (k < 0) return;
      const row = staffRows[k], orig = wAfter(i);
      if (refrainRows.has(row)) { out.push(...orig); return; } // refrain: same line on every page
      for (const p of onPage) {
        const w = stanzas[p].approx ? wLine(p, row) : orig[p];
        if (w) out.push(w);
      }
    });
    pages.push({ abc: out.join('\n'), stanzas: onPage });
  }
  return pages;
}

// ---------- MP3 duration (from the Xing/Info header LAME writes) ----------

function mp3Duration(file) {
  const b = fs.readFileSync(file);
  let i = 0;
  if (b.toString('latin1', 0, 3) === 'ID3') i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  while (i < b.length - 4 && !(b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0)) i++;
  const mpeg1 = (b[i + 1] & 0x18) === 0x18;
  const rates = mpeg1 ? [44100, 48000, 32000] : [22050, 24000, 16000];
  const sr = rates[(b[i + 2] >> 2) & 3];
  const mono = ((b[i + 3] >> 6) & 3) === 3;
  const x = i + 4 + (mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
  const tag = b.toString('latin1', x, x + 4);
  if ((tag !== 'Xing' && tag !== 'Info') || !(b.readUInt32BE(x + 4) & 1)) return null;
  return (b.readUInt32BE(x + 8) * (mpeg1 ? 1152 : 576)) / sr;
}

// ---------- Main ----------

function build(hymn, tmp) {
  const abcPath = path.resolve(hymn.abc);
  const abc = readAbc(abcPath);
  const base = { id: hymn.number, title: hymn.title, tune: hymn.tune, abc };

  const [tune] = abcjs.parseOnly(abc);
  const notes = melodyNotes(tune);
  const K = notes.reduce((a, n) => a + n.onsets, 0);            // onsets per stanza pass
  const verses = Math.max(0, ...notes.map((n) => n.el.lyric?.length ?? 0));
  const extra = textStanzas(abc);
  const { midi, kind } = buildMidi(abcPath, tmp);
  const onsets = melodyOnsets(midi);

  // Stanza passes are copies of each other, so their pitch sequences must match.
  // A couple of differences are allowed: the expander joins sections without barlines,
  // so an accidental can carry over into the next pass (the audio really plays it).
  // Try the expected number of passes first, then whatever fits.
  const pitchesAt = (from) => onsets.slice(from, from + K).map((o) => o.pitches.join('+'));
  const samePass = (a, b) => a.filter((x, k) => x !== b[k]).length <= Math.max(1, Math.floor(K * 0.05));
  // The intro is only the last few bars, so it must be shorter than one full pass --
  // otherwise "1 pass + a giant intro" would always fit and hide a real mismatch.
  const fits = (N) => {
    const intro = onsets.length - N * K;
    if (N < 1 || intro < 0 || intro >= K) return null;
    const first = pitchesAt(intro);
    for (let p = 1; p < N; p++) if (!samePass(first, pitchesAt(intro + p * K))) return null;
    return intro;
  };
  let N = kind === 'single-pass' ? 1 : verses + extra.length;
  let intro = fits(N);
  if (intro == null) for (N = Math.floor(onsets.length / K); N >= 1 && (intro = fits(N)) == null; N--);
  if (intro == null) return { ...base, synced: false, reason: `melody onsets (${onsets.length}) don't split into passes of ${K}` };
  // A single-pass MP3 has no intro; leftover notes mean abc2midi and abcjs read the ABC differently.
  if (kind === 'single-pass' && intro > 0) return { ...base, synced: false, reason: `ABC and MIDI disagree (${intro} extra melody notes)` };

  const mp3 = hymn.mp3 && fs.existsSync(hymn.mp3) ? mp3Duration(hymn.mp3) : null;
  // The MP3 had its trailing silence trimmed, so it may be a little shorter -- never longer.
  if (mp3 != null && (mp3 > midi.duration + 0.5 || mp3 < midi.duration - 3)) {
    return { ...base, synced: false, reason: `MIDI ${midi.duration.toFixed(1)}s vs MP3 ${mp3.toFixed(1)}s` };
  }

  const met = meter(abc);
  // How many stanza lines each music row has. Lines that are mostly "*" are echo parts
  // (e.g. "* * He a- rose! * *" answering the refrain), not stanzas, so a row's count
  // stops at its first echo line.
  const sungAt = (n, v) => { const x = n.el.lyric?.[v]?.syllable.replace(/^\d+\.\s*/, '').trim(); return Boolean(x && x !== '*'); };
  const rowLines = {};
  for (const r of new Set(notes.map((n) => n.row))) {
    const rowNotes = notes.filter((n) => n.row === r);
    const main = rowNotes.filter((n) => sungAt(n, 0)).length || 1;
    let count = 1;
    while (count < verses && rowNotes.filter((n) => sungAt(n, count)).length >= main * 0.5) count++;
    rowLines[r] = count;
  }
  const realVerses = Math.max(1, ...Object.values(rowLines)); // stanzas actually written under the notes
  // A refrain is written once (one w: line) but sung with every stanza.
  const refrainRows = new Set(Object.keys(rowLines).map(Number).filter((r) => realVerses > 1 && rowLines[r] === 1));
  // Stanza 1's melody notes that start a syllable, outside refrains: the slots text-only stanzas fill.
  const passTimes = Array.from({ length: N }, (_, p) => noteTimes(notes, onsets.slice(intro + p * K, intro + (p + 1) * K)));
  const slotIdx = notes.map((n, j) => j).filter((j) => {
    if (refrainRows.has(notes[j].row)) return false;
    const s = notes[j].el.lyric?.[0]?.syllable.replace(/^\d+\.\s*/, '').trim();
    return s && s !== '*';
  });
  const verseMeter = refrainRows.size ? null : met; // meter describes the stanza, not the refrain

  const stanzas = passTimes.map((times, p) => {
    const start = +onsets[intro + p * K].t.toFixed(3);
    const end = +(p + 1 < N ? onsets[intro + (p + 1) * K].t : midi.duration).toFixed(3);
    if (p < realVerses) {
      return { n: p + 1, start, end, approx: false, lines: toLines(alignedWords(notes, times, p, rowLines), met) };
    }
    if (p < verses) {
      // An extra pass caused by echo lines: mk-abc-for-midi repeats the last stanza's words.
      const last = realVerses - 1;
      return { n: last + 1, start, end, approx: false, repeatOf: last, lines: toLines(alignedWords(notes, times, last, rowLines), met) };
    }
    const text = extra[p - verses];
    if (!text) {
      // A pass with no words of its own (e.g. echo lines made the expander add one):
      // it re-sings the last written stanza.
      const last = realVerses - 1;
      return { n: last + 1, start, end, approx: false, repeatOf: last, lines: toLines(alignedWords(notes, times, last, rowLines), met) };
    }
    const refrain = refrainRows.size ? toLines(alignedWords(notes, times, p, rowLines, refrainRows), null) : [];
    const lines = approxWords(text, slotIdx.map((j) => ({ j, t: times[j] })), verseMeter);
    // Refrain and verse lines interleave by time (a refrain can come first).
    lines.push(...refrain);
    lines.sort((a, b) => (a[0]?.t ?? 0) - (b[0]?.t ?? 0));
    return { n: text.n ?? p + 1, start, end, approx: true, lines };
  });

  return {
    ...base,
    synced: true,
    duration: +midi.duration.toFixed(3),
    mp3Duration: mp3 && +mp3.toFixed(3),
    introEnd: stanzas[0].start,
    pages: buildPages(abc, tune, notes, stanzas, refrainRows),
    // (drop the internal note index `j` from approximate words)
    stanzas: stanzas.map((st) => ({ ...st, lines: st.lines.map((l) => l.map(({ text, t }) => ({ text, t }))) })),
    noteTimes: passTimes.map((t) => t.map((x) => +x.toFixed(3))), // per stanza, per written melody note
  };
}

// ---------- Run the manifest ----------

const manifestPath = process.argv[2];
if (!manifestPath) { console.error('usage: node build_timings.mjs <manifest.json>'); process.exit(2); }
const hymns = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lyric-timings-'));

for (const h of hymns) {
  let result;
  try {
    result = build(h, tmp);
  } catch (err) {
    result = { id: h.number, title: h.title, synced: false, reason: err.message };
  }
  if (result.abc) {
    fs.mkdirSync(path.dirname(h.out), { recursive: true });
    fs.writeFileSync(h.out, JSON.stringify(result));
  }
  // Summary for the Python importer. Repeat passes aren't new stanzas.
  const stanzas = result.stanzas?.filter((s) => s.repeatOf == null) ?? [];
  console.log(JSON.stringify({
    number: h.number,
    synced: Boolean(result.synced),
    reason: result.reason ?? null,
    written: Boolean(result.abc),
    stanzaCount: stanzas.length || null,
    firstLine: stanzas[0]?.lines?.[0]?.map((w) => w.text).join(' ') ?? null,
  }));
}
fs.rmSync(tmp, { recursive: true, force: true });
