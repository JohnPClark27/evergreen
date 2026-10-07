// Choose a Study Plan: every approved plan as a big card, with this tablet's progress
// ("3 of 12 done"). Enjoyed plans come first; plans marked "Skip next time" are hidden.
// Tapping a card opens the plan's page (#/plan/<id>). The cards sit in a grid 3 wide with
// fixed-size rows (2 fill the screen), so a few plans don't stretch; more plans scroll down.
import * as api from '../api.js';
import { doneCount, nextStudy } from '../plan-progress.js';
import { h, icon } from '../ui.js';

export async function render(root, _params, ctx) {
  const notes = ctx.store.studyNotes();
  const plans = (await api.getStudyPlans())
    .filter((p) => notes[p.id] !== 'skip' && p.studies.some((s) => s.items.length))
    .sort((a, b) => ((notes[b.id] === 'enjoyed') - (notes[a.id] === 'enjoyed')) || a.title.localeCompare(b.title));

  const card = (p) => {
    const progress = ctx.store.planProgress(p.id);
    const total = p.studies.length;
    const done = doneCount(p, progress);
    const next = nextStudy(p, progress);
    const status = done === 0 ? `${total} ${total === 1 ? 'study' : 'studies'}`
      : done >= total ? `${total} ${total === 1 ? 'study' : 'studies'} · all done`
        : `${total} studies · ${done} done`;
    return h('button', { class: 'study-tile', type: 'button', onclick: () => ctx.go(`#/plan/${p.id}`) },
      h('span', { class: 'study-tile-title' }, p.title),
      p.description && h('span', { class: 'study-tile-desc' }, p.description),
      h('span', { class: 'study-tile-meta' }, status),
      // a quiet, at-a-glance progress strip (one mark per study)
      total > 1 && h('span', { class: 'mini-progress', 'aria-hidden': 'true' },
        p.studies.map((s) => h('span', { class: progress.done.includes(s.key) ? 'done' : '' }))),
      h('span', { class: 'tags' },
        notes[p.id] === 'enjoyed' && h('span', { class: 'tag' }, 'Enjoyed before'),
        done > 0 && next && h('span', { class: 'tag quiet' }, `Next: ${next.title}`)));
  };

  root.append(h('div', { class: 'screen sing' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/explore') }, icon('back'), h('span', { class: 'label' }, 'Back to engage')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Choose a Study Plan'),
      h('p', { class: 'day' }, '')),
    plans.length
      ? h('div', { class: 'study-grid', tabindex: '0', role: 'region', 'aria-label': 'Study plans' }, plans.map(card))
      : h('p', { class: 'big-text card' }, 'No study plans are ready yet.')));
  return null;
}
