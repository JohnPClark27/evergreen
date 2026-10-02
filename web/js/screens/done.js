// Study finished: a calm close, optional aide notes about this study, and big next steps.
// No streaks, scores, or "come back tomorrow" pressure.
import { h } from '../ui.js';

export async function render(root, _params, ctx) {
  const { store } = ctx;
  const last = store.lastStudy();

  const noteStatus = h('p', { class: 'muted', 'aria-live': 'polite' });
  function note(kind) {
    store.setStudyNote(last.planId, kind);
    noteStatus.textContent = kind === 'enjoyed'
      ? `Noted: “${last.title}” will be shown first.`
      : `Noted: “${last.title}” will be hidden from the list.`;
  }

  root.append(h('div', { class: 'screen done' },
    h('div', { class: 'card done-card' },
      h('h1', { tabindex: '-1' }, 'That’s the end of this study.'),
      h('p', { class: 'big-text' }, 'Thank you for singing and praying together.'),
      last.planId && h('div', { class: 'aide-notes' },
        h('p', { class: 'muted small' }, `For the aide (optional): about “${last.title}”`),
        h('div', { class: 'note-buttons', role: 'group', 'aria-label': `Notes for ${last.title}` },
          h('button', { class: 'pill', type: 'button', onclick: () => note('enjoyed') }, 'Enjoyed it'),
          h('button', { class: 'pill', type: 'button', onclick: () => note('skip') }, 'Skip next time')),
        noteStatus)),
    h('div', { class: 'tiles three' },
      h('button', { class: 'tile', type: 'button', onclick: () => ctx.go('#/studies') },
        h('span', { class: 'tile-title' }, 'Choose another study')),
      h('button', { class: 'tile', type: 'button', onclick: () => ctx.go('#/sing') },
        h('span', { class: 'tile-title' }, 'Sing a hymn')),
      h('button', { class: 'tile primary', type: 'button', onclick: () => ctx.go('#/') },
        h('span', { class: 'tile-title' }, 'Home')))));
  return null;
}
