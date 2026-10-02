// Choose a Study: every approved study plan as a big card (enjoyed ones first; ones marked
// "Skip next time" are hidden). Tapping a card starts it.
import * as api from '../api.js';
import { estimateMinutes } from '../runner.js';
import { moduleFor } from '../../modules/index.js';
import { h, icon } from '../ui.js';

const PER_PAGE = 6;

export async function render(root, params, ctx) {
  const notes = ctx.store.studyNotes();
  const last = ctx.store.lastStudy();
  const plans = (await api.getStudyPlans())
    .filter((p) => notes[p.id] !== 'skip' && p.types.length)
    .sort((a, b) => ((notes[b.id] === 'enjoyed') - (notes[a.id] === 'enjoyed')) || a.title.localeCompare(b.title));
  const pages = Math.max(1, Math.ceil(plans.length / PER_PAGE));
  const page = Math.min(Math.max(0, Number(params.page ?? 0)), pages - 1);
  const shown = plans.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const parts = (types) => {
    // "Hymn · Scripture · Prayer" (repeated names collapse: "Hymn ×2")
    const names = [];
    for (const t of types) {
      const name = moduleFor(t)?.name ?? 'Part';
      const prev = names.at(-1);
      if (prev && prev.name === name) prev.n++; else names.push({ name, n: 1 });
    }
    return names.map((x) => (x.n > 1 ? `${x.name} ×${x.n}` : x.name)).join(' · ');
  };

  root.append(h('div', { class: 'screen sing' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Choose a Study'),
      h('p', { class: 'day' }, pages > 1 ? `Page ${page + 1} of ${pages}` : '')),
    shown.length
      ? h('div', { class: 'study-grid' }, shown.map((p) => h('button', {
        class: 'study-tile', type: 'button',
        onclick: async () => { await ctx.unlock(); ctx.go(`#/study/${p.id}`); },
      },
      h('span', { class: 'study-tile-title' }, p.title),
      p.description && h('span', { class: 'study-tile-desc' }, p.description),
      h('span', { class: 'study-tile-meta' }, `${parts(p.types)} · about ${estimateMinutes(p.types)} min`),
      h('span', { class: 'tags' },
        notes[p.id] === 'enjoyed' && h('span', { class: 'tag' }, 'Enjoyed before'),
        last.planId === p.id && h('span', { class: 'tag quiet' }, 'Last time')))))
      : h('p', { class: 'big-text card' }, 'No studies are ready yet.'),
    pages > 1 && h('footer', { class: 'bottombar' },
      h('button', { class: 'pill', type: 'button', disabled: page === 0, onclick: () => ctx.go(`#/studies?page=${page - 1}`) },
        icon('back'), h('span', { class: 'label' }, 'Previous')),
      h('button', { class: 'pill primary', type: 'button', disabled: page >= pages - 1, onclick: () => ctx.go(`#/studies?page=${page + 1}`) },
        h('span', { class: 'label' }, 'More studies'), icon('next')))));
  return null;
}
