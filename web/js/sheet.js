// sheet.js - sheet music for a hymn, drawn from its ABC with abcjs, with a cursor on the
// note being sung. Ported from v1 (public/js/score.js).
//
// abcjs MUST stay at the same version as pipeline/timings (6.7.1): the timing builder used
// abcjs to list the melody notes, so noteTimes[stanza][j] lines up with melody note j here.
// Hymns with more than 5 stanzas come with extra "pages" (a copy of the music with the next
// stanzas under the notes), prepared by the timing builder.
import { lastAtOrBefore, SING_LEAD, stanzaAt } from './lyrics.js';

export const ABCJS = {
  src: 'https://cdn.jsdelivr.net/npm/abcjs@6.7.1/dist/abcjs-basic-min.js',
  integrity: 'sha384-gO9mym1Z3WJwxNm4ZpC6ZQbMyiu+72akLTHzztpwTs6KYVd3NnfkQigzPk+Oqzqy',
};
const SVG_NS = 'http://www.w3.org/2000/svg';

// abcjs is ~500 KB, so load it only the first time someone opens sheet music.
let abcjsPromise = null;
export function loadAbcjs() {
  abcjsPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    Object.assign(s, { src: ABCJS.src, integrity: ABCJS.integrity, crossOrigin: 'anonymous' });
    s.onload = () => resolve(window.ABCJS);
    s.onerror = () => { abcjsPromise = null; reject(new Error('Could not load the sheet music renderer')); };
    document.head.append(s);
  });
  return abcjsPromise;
}

// ---------- Reading the rendered music ----------

// The melody notes in written order: the same list the timing builder used,
// so noteTimes[stanza][j] lines up with melody[j].
function melodyNotes(visual) {
  return visual.lines.flatMap((l) => (l.staff ? l.staff[0].voices[0] : []))
    .filter((e) => e.el_type === 'note' && !e.rest)
    .map((e) => e.abselem?.elemset?.[0])
    .filter(Boolean);
}

// abcjs draws all stanzas' syllables under a note as one <text> with a <tspan> per stanza
// row. A single row is a refrain (written once, sung by every stanza).
// Returns the <tspan> only if it actually has a syllable.
function syllableSvg(noteGroup, row) {
  const rows = noteGroup.querySelectorAll('text.abcjs-lyric tspan');
  const tspan = rows.length > row ? rows[row] : rows.length === 1 ? rows[0] : null;
  return tspan?.textContent.trim() ? tspan : null;
}

// The syllable sung at melody note j. Held notes (a tie, or several notes on one syllable)
// have no syllable of their own, so keep the most recent one lit while it's held.
function currentSyllable(melody, j, row) {
  for (let k = j; k >= 0; k--) {
    const tspan = syllableSvg(melody[k], row);
    if (tspan) return tspan;
  }
  return null;
}

// Bounding box (in SVG units) around a set of elements.
function unionBox(elements) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of elements) {
    let b;
    try { b = e.getBBox(); } catch { continue; }
    if (!b.width && !b.height) continue;
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
  }
  return x1 === Infinity ? null : { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

// ---------- Preparing the ABC for the screen ----------

// Header fields like "C: Words: ...": read their values, or remove the lines entirely
// (with the newline: a blank line in ABC ends the tune).
const fieldRe = (f) => new RegExp(`^${f}:[ \\t]*(.*)\\r?\\n?`, 'gm');
const takeField = (abc, f) => [...abc.matchAll(fieldRe(f))].map((m) => m[1].trim()).filter(Boolean);
const dropField = (abc, f) => abc.replace(fieldRe(f), '');

// - drop the file's print layout (%%pagewidth 21.6cm, %%scale 0.75, ...): we size it ourselves
// - text blocks use a literal "\t" for indentation, which abcjs would print
function cleanAbc(abc) {
  return abc
    .replace(/^%%(pagewidth|pageheight|scale|staffsep|leftmargin|rightmargin|topmargin|botmargin)\b.*\r?\n?/gm, '')
    .replace(/^(%%.*|W:.*)$/gm, (line) => line.replace(/\\t/g, ' '));
}

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text ?? '' });

// Draw one hymnal page into `into`. Returns { svg, melody }.
function renderPage(abcjs, abc, { label, into }) {
  const wrap = el('section', 'sheet-page');
  if (label) wrap.append(el('p', 'sheet-page-label', label));
  const page = el('div', 'sheet-paper');
  const target = document.createElement('div'); // abcjs restyles the element it draws into
  page.append(target);
  wrap.append(page);
  into.append(wrap);

  // Long one-line fields would be drawn as unbreakable SVG text that runs off the page, so
  // they go into wrapping HTML instead: the source note (S:) always, and on narrow screens
  // the title (T:) and credits (C:) too.
  const narrow = page.clientWidth < 600;
  let text = cleanAbc(abc);
  const titles = narrow ? takeField(text, 'T') : [];
  const credits = takeField(text, narrow ? '[CS]' : 'S');
  text = dropField(dropField(text, 'S'), narrow ? '[CT]' : 'S');
  if (titles.length) {
    const head = el('header', 'sheet-head');
    head.append(el('h3', '', titles[0]), ...titles.slice(1).map((t) => el('p', '', t)));
    page.prepend(head);
  }
  // Wide (iPad landscape): fixed layout scaled to the page. Narrow: reflow to ~2 bars per line.
  const layout = narrow
    ? { staffwidth: Math.max(260, page.clientWidth - 64), wrap: { minSpacing: 1.4, maxSpacing: 2.5, preferredMeasuresPerLine: 2 } }
    : { staffwidth: 760, responsive: 'resize' };
  const [visual] = abcjs.renderAbc(target, text, {
    ...layout,
    add_classes: true,
    paddingleft: 0,
    paddingright: 0,
    format: {
      titlefont: 'Literata 22', subtitlefont: 'Literata 15', composerfont: 'Literata Italic 11',
      vocalfont: 'Literata 13', wordsfont: 'Literata 13', textfont: 'Literata 13',
      annotationfont: 'Literata Italic 11',
    },
  });
  if (credits.length) {
    const box = el('div', 'sheet-credits');
    box.append(...credits.map((c) => el('p', '', c)));
    page.append(box);
  }
  return { svg: target.querySelector('svg'), melody: melodyNotes(visual) };
}

// ---------- The cursor ----------
//
// Three layers, so "where are we" is obvious at a glance:
//   1. a tinted column over the whole system (both staves + words) at the current note
//   2. the note itself in solid accent colour
//   3. a highlighter-style marker behind the current syllable
function createCursor() {
  let column = null, marker = null, svg = null, lit = [], lineKey = null;

  function ensure(target) {
    if (svg === target) return;
    column?.remove(); marker?.remove();
    svg = target;
    column = document.createElementNS(SVG_NS, 'rect');
    column.setAttribute('class', 'sheet-cursor');
    column.setAttribute('rx', 6);
    marker = document.createElementNS(SVG_NS, 'rect');
    marker.setAttribute('class', 'sheet-marker');
    marker.setAttribute('rx', 3);
    svg.prepend(marker); // behind the music
    svg.prepend(column);
    lineKey = null;
  }

  return {
    // Move to a note (its <g>) and optionally a syllable (<tspan>).
    // Returns true if the cursor moved to a new line of music (so the view should scroll).
    show(target, noteGroup, syllable) {
      ensure(target);
      for (const e of lit) e.classList.remove('sheet-now');
      lit = [noteGroup, syllable].filter(Boolean);
      for (const e of lit) e.classList.add('sheet-now');

      // The column spans the whole system this note is on (abcjs tags each line abcjs-lN).
      const line = /abcjs-l\d+/.exec(noteGroup.getAttribute('class') ?? '')?.[0];
      const head = unionBox(noteGroup.querySelectorAll('path')) ?? unionBox([noteGroup]);
      let newLine = false;
      if (line !== lineKey) {
        const sys = unionBox(svg.querySelectorAll(`.${line}`));
        if (sys) { column.setAttribute('y', sys.y - 8); column.setAttribute('height', sys.height + 16); }
        lineKey = line;
        newLine = true;
        column.classList.add('jump'); // no glide when changing lines
      } else {
        column.classList.remove('jump');
      }
      if (head) {
        column.setAttribute('width', head.width + 16);
        column.style.transform = `translate(${head.x - 8}px, 0)`;
        column.style.display = '';
      }
      const syl = syllable && unionBox([syllable]);
      if (syl) {
        marker.setAttribute('x', syl.x - 4);
        marker.setAttribute('y', syl.y - 1);
        marker.setAttribute('width', syl.width + 8);
        marker.setAttribute('height', syl.height + 2);
        marker.style.display = '';
      } else {
        marker.style.display = 'none';
      }
      return newLine;
    },
    hide() {
      for (const e of lit) e.classList.remove('sheet-now');
      lit = [];
      if (column) column.style.display = 'none';
      if (marker) marker.style.display = 'none';
      lineKey = null;
    },
    get element() { return column; },
  };
}

// "Page 2 · Stanzas 6–10" labels, only when a hymn has more than one page.
function pageSpecs(data) {
  const specs = data.pages ?? [{
    abc: data.abc,
    stanzas: (data.stanzas ?? []).map((_, i) => i).filter((i) => data.stanzas[i].repeatOf == null),
  }];
  return specs.map((spec, k) => {
    const nums = spec.stanzas.map((i) => data.stanzas?.[i]?.n ?? i + 1);
    const label = specs.length > 1
      ? `Page ${k + 1} · Stanza${nums.length > 1 ? `s ${nums[0]}–${nums.at(-1)}` : ` ${nums[0]}`}`
      : '';
    return { ...spec, label };
  });
}

// ---------- Public ----------

/**
 * Sheet music in `container`, following the audio.
 *   getTime(): audio position (s) or null.   onStatus(text): "Stanza 2 of 5 · page 1", "Intro", ''.
 * Returns { show(data), start(), stop() }.
 */
export function createSheet(container, { getTime, onStatus } = {}) {
  let raf = 0, data = null, pages = [], litKey = null;
  const cursor = createCursor();
  const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  const status = (text) => onStatus?.(text);

  function clear(label = '') {
    if (litKey === null) return;
    cursor.hide();
    litKey = null;
    status(label);
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    const pos = getTime?.();
    if (pos == null || !data?.synced || !pages.length) return clear();
    const t = pos + SING_LEAD;
    const p = stanzaAt(data, t);
    if (p < 0) { clear('Intro'); return; }
    const j = lastAtOrBefore(data.noteTimes[p], t);
    const key = `${p}:${j}`;
    if (j < 0 || key === litKey) return;
    litKey = key;

    // A "repeat" pass (see the timing builder) re-sings an earlier stanza's words.
    const shown = data.stanzas[p].repeatOf ?? p;
    const k = Math.max(0, pages.findIndex((pg) => pg.stanzas.includes(shown)));
    const { svg, melody, stanzas } = pages[k];
    const row = Math.max(0, stanzas.indexOf(shown));
    status(`Stanza ${data.stanzas[p].n} of ${data.stanzas.filter((s) => s.repeatOf == null).length}`
      + (pages.length > 1 ? ` · page ${k + 1}` : ''));
    const note = melody[j];
    if (!note) return;
    // Without generated pages, text-only stanzas are printed below the music: no syllable.
    const syllable = !data.pages && data.stanzas[p].approx ? null : currentSyllable(melody, j, row);
    if (cursor.show(svg, note, syllable)) {
      cursor.element.scrollIntoView({ block: 'center', behavior: smooth() });
    }
  }

  return {
    /** Draw a hymn's sheet music (timing JSON from api.getTiming). */
    async show(timing) {
      cancelAnimationFrame(raf);
      cursor.hide();
      litKey = null;
      data = timing;
      container.replaceChildren(el('p', 'sheet-message', 'Loading sheet music…'));
      try {
        const [abcjs] = await Promise.all([loadAbcjs(), document.fonts?.ready]);
        if (data !== timing) return; // another hymn was requested meanwhile
        container.replaceChildren();
        pages = pageSpecs(data).map((spec) => ({ ...renderPage(abcjs, spec.abc, { label: spec.label, into: container }), stanzas: spec.stanzas }));
      } catch (err) {
        container.replaceChildren(el('p', 'sheet-message', `Couldn't show the sheet music. ${err.message}`));
      }
    },
    /** Follow the audio with the cursor. */
    start() { cancelAnimationFrame(raf); tick(); },
    stop() { cancelAnimationFrame(raf); cursor.hide(); litKey = null; },
  };
}
