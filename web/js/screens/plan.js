// One study plan (#/plan/<id>): a big "Start" / "Continue" button for the next unfinished
// study, then every study in order with ✓ for ones this tablet has finished. Any study can
// be opened, in any order. Progress is kept on this tablet only.
import * as api from '../api.js';
import { isDone, nextStudy, doneCount } from '../plan-progress.js';
import { estimateMinutes } from '../runner.js';
import { moduleFor } from '../../modules/index.js';
import { confirmDialog, h, icon } from '../ui.js';

/** "Hymn · Scripture · Prayer" (repeats collapse: "Hymn ×2"). */
export function partsLabel(items) {
  const names = [];
  for (const i of items) {
    const name = moduleFor(i.module_type)?.name ?? 'Part';
    const prev = names.at(-1);
    if (prev && prev.name === name) prev.n++; else names.push({ name, n: 1 });
  }
  return names.map((x) => (x.n > 1 ? `${x.name} ×${x.n}` : x.name)).join(' · ');
}

export async function render(root, params, ctx) {
  const plan = await api.getStudyPlan(Number(params.arg));
  if (!plan) {
    root.append(h('div', { class: 'screen message' },
      h('h1', { class: 'big-text', tabindex: '-1' }, 'That study plan isn’t available.'),
      h('button', { class: 'pill primary', type: 'button', onclick: () => ctx.go('#/studies') }, 'Choose a study plan')));
    return null;
  }
  const progress = ctx.store.planProgress(plan.id);
  const next = nextStudy(plan, progress);
  const done = doneCount(plan, progress);
  // Each study opens inside the tap that chose it, so sound is allowed to start.
  const open = (s) => async () => { await ctx.unlock(); ctx.go(`#/study/${plan.id}/${s.position + 1}`); };

  const first = plan.studies.find((s) => s.items.length);
  const main = next
    ? h('button', { class: 'pill primary big continue', type: 'button', onclick: open(next) },
      h('span', { class: 'label' }, `${done ? 'Continue' : 'Start'}: Study ${next.position + 1}`), icon('next'))
    : first && h('button', { class: 'pill primary big continue', type: 'button', onclick: open(first) },
      h('span', { class: 'label' }, 'Every study is done · Study 1 again'), icon('again'));

  const list = h('ol', { class: 'study-list' }, plan.studies.map((s) => {
    const finished = isDone(progress, s);
    const isNext = next && s.id === next.id;
    return h('li', {},
      h('button', {
        class: `study-row${finished ? ' done' : ''}${isNext ? ' next' : ''}`, type: 'button',
        disabled: !s.items.length, onclick: open(s),
        'aria-label': `Study ${s.position + 1}: ${s.title}${finished ? ', done' : ''}${isNext ? ', next up' : ''}`,
      },
      h('span', { class: 'study-num', 'aria-hidden': 'true' }, finished ? icon('check') : String(s.position + 1)),
      h('span', { class: 'study-row-text' },
        h('span', { class: 'study-row-title' }, s.title),
        h('span', { class: 'study-row-meta' }, s.items.length
          ? `${partsLabel(s.items)} · about ${estimateMinutes(s.items.map((i) => i.module_type))} min`
          : 'Nothing in this study yet')),
      isNext && h('span', { class: 'tag' }, 'Next up')));
  }));

  const resetBtn = done > 0 && h('button', {
    class: 'link-button', type: 'button',
    onclick: async () => {
      if (await confirmDialog(`Start “${plan.title}” over on this tablet? The ✓ marks will be cleared.`, { yes: 'Start over' })) {
        ctx.store.resetPlanProgress(plan.id);
        ctx.go(`#/plan/${plan.id}?r=${Date.now()}`); // redraw
      }
    },
  }, 'Start this plan over');

  root.append(h('div', { class: 'screen sing plan' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/studies') }, icon('back'), h('span', { class: 'label' }, 'All plans')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, plan.title),
      h('p', { class: 'day' }, `${done} of ${plan.studies.length} done`)),
    h('section', { class: 'card plan-card', tabindex: '0', 'aria-label': `${plan.title}: studies` },
      plan.description && h('p', { class: 'plan-desc' }, plan.description),
      main,
      list,
      resetBtn)));
  return null;
}
