// Choose a Study Plan: every approved plan as a big card, with this tablet's progress
// ("3 of 12 done"). Enjoyed plans come first; plans marked "Skip next time" are hidden.
// Tapping a card opens the plan's page (#/plan/<id>).
import * as api from '../api.js';
import { doneCount, nextStudy } from '../plan-progress.js';
import { h, icon } from '../ui.js';

const PER_PAGE = 6;

export async function render(root, params, ctx) {
  const notes = ctx.store.studyNotes();
  const plans = (await api.getStudyPlans())
    .filter((p) => notes[p.id] !== 'skip' && p.studies.some((s) => s.items.length))
    .sort((a, b) => ((notes[b.id] === 'enjoyed') - (notes[a.id] === 'enjoyed')) || a.title.localeCompare(b.title));
  const pages = Math.max(1, Math.ceil(plans.length / PER_PAGE));
  const page = Math.min(Math.max(0, Number(params.page ?? 0)), pages - 1);
  const shown = plans.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

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
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Choose a Study Plan'),
      h('p', { class: 'day' }, pages > 1 ? `Page ${page + 1} of ${pages}` : '')),
    shown.length
      ? h('div', { class: 'study-grid' }, shown.map(card))
      : h('p', { class: 'big-text card' }, 'No study plans are ready yet.'),
    pages > 1 && h('footer', { class: 'bottombar' },
      h('button', { class: 'pill', type: 'button', disabled: page === 0, onclick: () => ctx.go(`#/studies?page=${page - 1}`) },
        icon('back'), h('span', { class: 'label' }, 'Previous')),
      h('button', { class: 'pill primary', type: 'button', disabled: page >= pages - 1, onclick: () => ctx.go(`#/studies?page=${page + 1}`) },
        h('span', { class: 'label' }, 'More plans'), icon('next')))));
  return null;
}
