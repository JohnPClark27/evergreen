// Session finished: a calm close, what's next, optional aide notes, and big next steps.
// No streaks, scores, or "come back tomorrow" pressure: just what will be ready next time.
import * as api from '../api.js';
import { h } from '../ui.js';

export async function render(root, _params, ctx) {
  const { store } = ctx;
  const last = store.lastSession();
  const next = store.progress().currentDay;
  const hymn = last.hymnNumber ? await api.getHymn(last.hymnNumber).catch(() => null) : null;

  const noteStatus = h('p', { class: 'muted', 'aria-live': 'polite' });
  const noteButtons = hymn && h('div', { class: 'note-buttons', role: 'group', 'aria-label': `Notes for ${hymn.title}` },
    h('button', { class: 'pill', type: 'button', onclick: () => note('enjoyed') }, 'Enjoyed it'),
    h('button', { class: 'pill', type: 'button', onclick: () => note('skip') }, 'Skip next time'));

  function note(kind) {
    store.setNote(hymn.number, kind);
    noteStatus.textContent = kind === 'enjoyed'
      ? `Noted: “${hymn.title}” will be shown first in Sing a Hymn.`
      : `Noted: “${hymn.title}” will be hidden in Sing a Hymn.`;
  }

  root.append(h('div', { class: 'screen done' },
    h('div', { class: 'card done-card' },
      h('h1', { tabindex: '-1' }, 'That’s today’s session.'),
      h('p', { class: 'big-text' }, 'Thank you for singing and praying together.'),
      h('p', { class: 'big-text muted' }, `Day ${next} will be ready next time.`),
      hymn && h('div', { class: 'aide-notes' },
        h('p', { class: 'muted small' }, `For the aide (optional): about “${hymn.title}”`),
        noteButtons, noteStatus)),
    h('div', { class: 'tiles three' },
      hymn && h('button', { class: 'tile', type: 'button', onclick: async () => { await ctx.unlock(); ctx.go(`#/sing/${hymn.number}`); } },
        h('span', { class: 'tile-title' }, 'Sing again')),
      h('button', { class: 'tile', type: 'button', onclick: () => ctx.go('#/sing') },
        h('span', { class: 'tile-title' }, 'Sing another hymn')),
      h('button', { class: 'tile primary', type: 'button', onclick: () => ctx.go('#/') },
        h('span', { class: 'tile-title' }, 'Home')))));
  return null;
}
