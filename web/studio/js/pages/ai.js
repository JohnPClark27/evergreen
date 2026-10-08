// AI prompt (admins): what guides the AI when it chooses a resident's "verse of the day"
// after "How are you feeling today?" on the tablet.
//
//   Editable here: the GUIDANCE (tone, what to prefer or avoid) and, per feeling, THEMES and
//   EXAMPLE PASSAGES (references of 1-3 verses; the AI may choose others like them).
//   Fixed (shown, not editable): the safety rules in the curate Edge Function, e.g. "give only
//   a reference, never write verse text". The database checks every save; changes are audited.
//   "Try it" asks the AI exactly as a tablet would (after saving).
import * as db from '../db.js';
import { BOOKS, refLabel } from '../../../js/books.js';
import { MOODS } from '../../../js/mood.js';
import { flash, h, when } from '../ui.js';

const FIXED = [
  'The AI chooses freely from the whole Bible: the examples show tone and themes only, and it uses one only when it is clearly the best fit.',
  'The verse of the day is 1 to 3 consecutive verses.',
  'The AI gives only a reference; it never writes verse text, prayers or teaching. The text always comes from YouVersion.',
  'It chooses 4 activities from published hymns, prayers and games, by id; anything else is dropped.',
  'Every reference is checked (real book and chapter, 1–3 verses, found on YouVersion); if not, one of your examples is used.',
  'The AI thinks step by step first; only its final choice is used.',
];
const MAX_REFS = 8;

const parseRef = (s) => {
  const m = /^([1-3A-Z]{3})\.(\d+)\.(\d+)-(\d+)$/.exec(s ?? '');
  return m ? { book: m[1], chapter: Number(m[2]), start: Number(m[3]), end: Number(m[4]) } : null;
};
const refKey = (r) => `${r.book}.${r.chapter}.${r.start}-${r.end}`;

/** Problems with one passage, in plain words ([] = fine). */
function refProblems(r) {
  const book = BOOKS.find((b) => b[0] === r.book);
  if (!book) return ['Choose a book.'];
  if (!(r.chapter >= 1 && r.chapter <= book[2])) return [`${book[1]} has chapters 1–${book[2]}.`];
  if (!(r.start >= 1) || !(r.end >= r.start)) return ['The last verse must be the same as or after the first.'];
  if (r.end - r.start > 2) return ['At most 3 verses (a verse of the day must fit on the screen).'];
  return [];
}

export async function render(main, _params, app) {
  const row = await db.getAiPrompt('today');
  if (!row) {
    main.append(h('h1', {}, 'AI prompt'), h('p', { class: 'banner error' }, 'The prompt isn’t in the database yet (migration 0010).'));
    return null;
  }
  // Working copy: guidance text, and per feeling { level, themes: [..], refs: [{book,chapter,start,end}] }.
  const v = {
    guidance: row.guidance,
    examples: MOODS.map((m) => {
      const e = row.examples.find((x) => x.level === m.level) ?? { themes: [], refs: [] };
      return { level: m.level, themes: [...e.themes], refs: e.refs.map(parseRef).filter(Boolean) };
    }),
  };
  const dirty = () => { app.dirty = () => true; };
  const status = h('p', { role: 'status', hidden: true });
  const saved = h('p', { class: 'muted small' });
  const drawSaved = (r) => { saved.textContent = `Last saved ${when(r.updated_at)} by ${r.updated_by ?? 'unknown'}.`; };
  drawSaved(row);

  // ---- guidance ----
  const guidance = h('textarea', { class: 'input', id: 'ai-guidance', rows: '7', maxlength: '4000',
    oninput: (e) => { v.guidance = e.target.value; dirty(); } });
  guidance.value = v.guidance;

  // ---- one feeling: themes + example passages ----
  const moodsBox = h('div', { class: 'ai-moods' });
  function drawMoods() {
    moodsBox.replaceChildren(...v.examples.map((e, i) => {
      const mood = MOODS[i];
      const themes = h('input', { class: 'input', id: `ai-themes-${e.level}`, maxlength: '250', value: e.themes.join(', '),
        oninput: (ev) => { e.themes = ev.target.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6); dirty(); } });
      const rows = e.refs.map((r, k) => {
        const problems = refProblems(r);
        const num = (key, label, max) => h('input', { class: 'input narrow', type: 'number', min: '1', max: String(max), value: String(r[key]),
          'aria-label': `${mood.label}, passage ${k + 1}: ${label}`,
          onchange: (ev) => { r[key] = Number(ev.target.value); dirty(); drawMoods(); } });
        return h('div', { class: 'ai-ref' },
          h('select', { class: 'input', 'aria-label': `${mood.label}, passage ${k + 1}: book`,
            onchange: (ev) => { r.book = ev.target.value; dirty(); drawMoods(); } },
          BOOKS.map(([code, name]) => h('option', { value: code, selected: code === r.book }, name))),
          num('chapter', 'chapter', 150), h('span', {}, ':'), num('start', 'first verse', 176), h('span', {}, '–'), num('end', 'last verse', 176),
          h('strong', { class: 'ai-ref-label' }, problems.length ? '' : refLabel(r.book, r.chapter, r.start, r.end)),
          e.refs.length > 1 && h('button', { class: 'btn small', type: 'button', 'aria-label': `Remove passage ${k + 1} for ${mood.label}`,
            onclick: () => { e.refs.splice(k, 1); dirty(); drawMoods(); } }, 'Remove'),
          problems.length > 0 && h('p', { class: 'item-errors' }, problems.join(' ')));
      });
      return h('fieldset', { class: 'panel ai-mood' },
        h('legend', {}, `${mood.level}. ${mood.label}`),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: `ai-themes-${e.level}` }, 'Themes (comma-separated, up to 6)'), themes),
        h('p', { class: 'field-label' }, 'Example passages (1–3 verses each)'),
        rows,
        e.refs.length < MAX_REFS && h('button', { class: 'btn small', type: 'button',
          onclick: () => { e.refs.push({ book: 'PSA', chapter: 23, start: 1, end: 1 }); dirty(); drawMoods(); } }, '+ Add a passage'));
    }));
  }

  // ---- save ----
  async function save() {
    const bad = v.examples.flatMap((e, i) => e.refs.flatMap((r) => refProblems(r).map((p) => `${MOODS[i].label}: ${p}`)));
    if (v.guidance.trim().length < 20) bad.unshift('Write at least a sentence of guidance.');
    if (v.examples.some((e) => !e.refs.length)) bad.push('Every feeling needs at least one example passage.');
    if (bad.length) return flash(status, bad.join(' '), 'error');
    try {
      const [r] = await db.saveAiPrompt('today', v.guidance.trim(),
        v.examples.map((e) => ({ level: e.level, themes: e.themes, refs: e.refs.map(refKey) })));
      app.dirty = null;
      drawSaved(r);
      flash(status, 'Saved. Evergreen uses it from the next My Day.');
    } catch (err) { flash(status, err.message, 'error'); }
  }

  // ---- try it ----
  const lib = await db.loadLibrary().catch(() => null);
  const tryMood = h('select', { class: 'input', id: 'ai-try-mood' }, MOODS.map((m) => h('option', { value: String(m.level) }, m.label)));
  const tryOut = h('div', { class: 'ai-try-out', 'aria-live': 'polite' });
  const tryBtn = h('button', { class: 'btn', type: 'button' }, 'Try it');
  tryBtn.addEventListener('click', async () => {
    if (app.dirty?.()) { flash(status, 'Save first: “Try it” uses the saved prompt.', 'error'); return; }
    tryBtn.disabled = true;
    tryOut.replaceChildren(h('p', { class: 'muted' }, 'Asking the AI… (a few seconds)'));
    try {
      const r = await db.tryToday(Number(tryMood.value));
      const ref = parseRef(r.verse?.ref);
      const name = (p) => (p.module_type === 'hymn' ? `Hymn: ${lib?.hymn(p.id_or_ref)?.title ?? `#${p.id_or_ref}`}`
        : p.module_type === 'prayer' ? `Prayer: ${lib?.prayer(p.id_or_ref)?.title ?? p.id_or_ref}`
          : `${p.module_type === 'read' ? 'Read' : p.module_type}: ${parseRef(p.id_or_ref) ? refLabel(...Object.values(parseRef(p.id_or_ref))) : p.id_or_ref}`);
      tryOut.replaceChildren(
        h('p', {}, h('span', { class: `chip ${r.source === 'ai' ? 'published' : 'draft'}` }, r.source === 'ai' ? `Chosen by AI (${r.provider})` : 'AI skipped: example used'),
          ' ', h('strong', {}, ref ? refLabel(ref.book, ref.chapter, ref.start, ref.end) : r.verse?.ref)),
        r.verse?.reason && h('p', { class: 'muted' }, `Why: ${r.verse.reason}`),
        h('ol', {}, (r.picks ?? []).map((p) => h('li', {}, name(p), p.reason ? h('span', { class: 'muted' }, ` · ${p.reason}`) : ''))));
    } catch (err) {
      tryOut.replaceChildren(h('p', { class: 'banner error' }, err.message));
    }
    tryBtn.disabled = false;
  });

  main.append(
    h('div', { class: 'toolbar' }, h('h1', {}, 'AI prompt: Chosen for you'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save')),
    h('p', {}, 'After a resident answers “How are you feeling today?”, the AI chooses a verse of the day and four activities. ',
      'This page sets how it chooses. The examples show the tone and themes; the AI is free to choose any fitting passage.'),
    saved, status,
    h('section', { class: 'panel' },
      h('h2', {}, 'Guidance'),
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'ai-guidance' }, 'What the AI should keep in mind (tone, what to prefer or avoid)'),
        guidance,
        h('p', { class: 'field-hint' }, 'Plain sentences. Don’t paste Scripture here: give references in the examples below.'))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Always applied (not editable)'),
      h('ul', {}, FIXED.map((t) => h('li', {}, t)))),
    h('h2', {}, 'Themes and example passages for each feeling'),
    moodsBox,
    h('section', { class: 'panel' },
      h('h2', {}, 'Try it'),
      h('div', { class: 'btn-row' }, h('label', { class: 'field-label', for: 'ai-try-mood' }, 'Feeling'), tryMood, tryBtn),
      tryOut),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save')));
  drawMoods();
  return () => { app.dirty = null; };
}
