// Study finished: a calm close, what comes next in the plan, optional aide notes about the
// plan, and big next steps. No streaks, scores, or "come back tomorrow" pressure.
import * as api from '../api.js';
import { nextStudy } from '../plan-progress.js';
import { h, thumbButtons } from '../ui.js';

export async function render(root, _params, ctx) {
  const { store } = ctx;
  const last = store.lastStudy();
  const plan = last.planId ? await api.getStudyPlan(last.planId).catch(() => null) : null;
  const next = plan ? nextStudy(plan, store.planProgress(plan.id)) : null;

  const noteStatus = h('p', { class: 'muted', 'aria-live': 'polite' });
  function note(kind) {
    store.setStudyNote(last.planId, kind);
    noteStatus.textContent = kind === 'enjoyed'
      ? `Noted: “${last.title}” will be shown first.`
      : `Noted: “${last.title}” will be hidden from the list.`;
  }

  const openNext = async () => { await ctx.unlock(); ctx.go(`#/study/${plan.id}/${next.position + 1}`); };

  root.append(h('div', { class: 'screen done' },
    h('div', { class: 'card done-card' },
      h('h1', { tabindex: '-1' }, 'That’s the end of this study.'),
      h('p', { class: 'big-text' }, 'Thank you for singing and praying together.'),
      plan && h('p', { class: 'big-text muted' }, next
        ? `Next in “${plan.title}”: Study ${next.position + 1}, ${next.title}.`
        : `That was the last study in “${plan.title}” still to do.`),
      last.planId && h('div', { class: 'aide-notes' },
        thumbButtons(store.studyNotes()[last.planId], note, `Notes for ${last.title}`),
        noteStatus)),
    h('div', { class: 'tiles three' },
      next
        ? h('button', { class: 'tile', type: 'button', onclick: openNext },
          h('span', { class: 'tile-title' }, `Next: Study ${next.position + 1}`),
          h('span', { class: 'tile-sub' }, next.title))
        : h('button', { class: 'tile', type: 'button', onclick: () => ctx.go('#/studies') },
          h('span', { class: 'tile-title' }, 'Choose another plan')),
      plan && h('button', { class: 'tile', type: 'button', onclick: () => ctx.go(`#/plan/${plan.id}`) },
        h('span', { class: 'tile-title' }, 'Back to the plan')),
      h('button', { class: 'tile primary', type: 'button', onclick: () => ctx.go('#/') },
        h('span', { class: 'tile-title' }, 'My Day')))));
  return null;
}
