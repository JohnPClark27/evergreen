// Prayers (#/prayers): the published prayer library as big tiles.
// One prayer (#/prayers/<id>): just the prayer, in large print, with its source; "Read aloud"
// (the device voice, only when tapped) and "More prayers". The top-left button goes back to
// the hub (My Day, or Engage further).
import * as api from '../api.js';
import { splitLines } from '../speech.js';
import { hubButton } from '../nav.js';
import { h, icon, readAloudButton } from '../ui.js';

export async function render(root, params, ctx) {
  return params.arg ? one(root, Number(params.arg), ctx) : list(root, ctx);
}

async function list(root, ctx) {
  const prayers = await api.getPrayers();
  root.append(h('div', { class: 'screen sing' },
    h('header', { class: 'topbar' },
      hubButton(ctx),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Prayers'),
      h('p', { class: 'day' }, '')),
    h('div', { class: 'study-grid', tabindex: '0', role: 'region', 'aria-label': 'Prayers' },
      prayers.map((p) => h('button', { class: 'study-tile', type: 'button', onclick: () => ctx.go(`#/prayers/${p.id}`) },
        h('span', { class: 'study-tile-title' }, p.title),
        h('span', { class: 'study-tile-meta' }, p.attribution ?? p.source))))));
  return null;
}

async function one(root, id, ctx) {
  const { speaker } = ctx;
  const prayer = await api.getPrayerById(id);
  if (!prayer) { ctx.go('#/prayers'); return null; }
  const lines = splitLines(prayer.text);
  const items = lines.map((l) => h('p', { class: 'read-line' }, l));

  // Read aloud only when asked (device voice), highlighting the line being read.
  const readBtn = readAloudButton(speaker, () => lines, { items });

  root.append(h('div', { class: 'screen prayer-screen' },
    h('header', { class: 'topbar' },
      hubButton(ctx),
      h('h1', { class: 'screen-title', tabindex: '-1' }, prayer.title),
      h('p', { class: 'day' }, '')),
    h('section', { class: 'card', tabindex: '0', 'aria-label': prayer.title },
      h('div', { class: 'reading-panel centered' },
        h('div', { class: 'read-lines' }, items),
        h('p', { class: 'muted small attribution' }, prayer.attribution ?? prayer.source))),
    h('footer', { class: 'bottombar' },
      readBtn,
      h('button', { class: 'pill primary big', type: 'button', onclick: () => ctx.go('#/prayers') },
        h('span', { class: 'label' }, 'More prayers'), icon('next')))));
  return () => speaker.stop();
}
