// kit.js - building blocks shared by every module, so each module file stays short.
//
//   Editor side (Studio):  field(), textInput(), textArea(), numberInput(), select(), searchSelect()
//   Player side (tablet):  readAloud(), stack()
//
// Modules never talk to the database directly: the Studio passes a `lib` (published hymns,
// prayers) to editors, and players get a `kit` with the shared audio/speech and the api.
import { bringIntoView, h } from '../js/ui.js';
import { splitLines } from '../js/speech.js';

export { h };

// ---------------------------------------------------------------------------
// Editor fields (styled by studio.css: .field, .field-label, .field-hint, .input)
// ---------------------------------------------------------------------------

let uid = 0;
const nextId = () => `f${++uid}`;

/** A labelled form row. `control` must be one element; its id is wired to the label. */
export function field(label, control, hint = null) {
  const id = control.id || (control.id = nextId());
  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    control,
    hint && h('p', { class: 'field-hint' }, hint));
}

export function textInput(value, onInput, { maxLength = 120, placeholder = '' } = {}) {
  return h('input', {
    class: 'input', type: 'text', value: value ?? '', maxlength: String(maxLength), placeholder,
    oninput: (e) => onInput(e.target.value),
  });
}

export function textArea(value, onInput, { maxLength = 2000, rows = 6, placeholder = '' } = {}) {
  const el = h('textarea', { class: 'input', rows: String(rows), maxlength: String(maxLength), placeholder,
    oninput: (e) => onInput(e.target.value) });
  el.value = value ?? '';
  return el;
}

export function numberInput(value, onInput, { min = 1, max = 999 } = {}) {
  return h('input', {
    class: 'input narrow', type: 'number', min: String(min), max: String(max), value: value ?? '',
    oninput: (e) => onInput(e.target.value === '' ? null : Number(e.target.value)),
  });
}

/** options: [{ value, label }] */
export function select(options, value, onChange) {
  const el = h('select', { class: 'input', onchange: (e) => onChange(e.target.value) },
    options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
  return el;
}

/**
 * A searchable list for long libraries (hymns, prayers): a filter box above a list box.
 * items: [{ value, label, search? }]. onChange(value) gets the chosen item's value.
 */
export function searchSelect(items, value, onChange, { placeholder = 'Type to filter…', size = 7 } = {}) {
  const list = h('select', { class: 'input', size: String(size), onchange: (e) => onChange(e.target.value) });
  const filter = h('input', { class: 'input', type: 'search', placeholder, 'aria-label': placeholder });
  function fill() {
    const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    list.replaceChildren(...items
      .filter((it) => words.every((w) => (it.search ?? it.label).toLowerCase().includes(w)) || String(it.value) === String(value))
      .map((it) => h('option', { value: String(it.value), selected: String(it.value) === String(value) }, it.label)));
  }
  filter.addEventListener('input', fill);
  fill();
  const box = h('div', { class: 'search-select' }, filter, list);
  box.id = list.id = nextId(); // so field() can label the list
  return box;
}

// ---------------------------------------------------------------------------
// Player helpers
// ---------------------------------------------------------------------------

/** A vertical group of elements (most players are a title + content + footer). */
export const stack = (cls, ...children) => h('div', { class: cls }, ...children);

/**
 * Show text in large print and read it aloud, highlighting the part being read.
 * lines: [{num, text}] (Scripture verses) or [string] (prayer/note lines).
 * Returns a player controller ({ againLabel, again, pause, resume, stop }).
 */
export function readAloud(stage, kit, { title, badge = null, lines, footer = null, centered = false, speak = true }) {
  const { speaker } = kit;
  const items = lines.map((line) => (typeof line === 'string'
    ? h('p', { class: 'read-line' }, line)
    : h('p', { class: 'read-line' }, h('sup', { class: 'vnum' }, String(line.num)), ' ', line.text)));
  stage.replaceChildren(h('div', { class: `reading-panel${centered ? ' centered' : ''}` },
    title && h('h2', { class: 'title' }, title),
    badge && h('p', { class: 'badge' }, badge),
    h('div', { class: 'read-lines' }, items),
    footer && h('p', { class: 'muted small attribution' }, footer)));

  const onSegment = (e) => {
    items.forEach((p, i) => p.classList.toggle('reading', i === e.detail.index));
    bringIntoView(items[e.detail.index]);
  };
  const onEnd = () => items.forEach((p) => p.classList.remove('reading'));
  speaker.addEventListener('segment', onSegment);
  speaker.addEventListener('end', onEnd);

  const start = () => {
    if (!speak) return;
    const run = typeof lines[0] === 'string' ? speaker.speakText(lines.join('\n')) : speaker.speakVerses(lines);
    run.catch(() => {});
  };
  if (!kit.paused()) start();
  return {
    againLabel: 'Read again',
    again: () => (speaker.state === 'idle' ? start() : speaker.repeat().catch(() => {})),
    pause: () => speaker.pause(),
    resume: () => (speaker.state === 'paused' ? speaker.resume() : null),
    stop() {
      speaker.removeEventListener('segment', onSegment);
      speaker.removeEventListener('end', onEnd);
      speaker.stop();
    },
  };
}

export { splitLines };
