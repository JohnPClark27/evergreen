// One study plan (#/study/<id>): the runner plays its modules; Finish goes to "done".
import * as api from '../api.js';
import { runStudy } from '../runner.js';
import { h } from '../ui.js';

export async function render(root, params, ctx) {
  const plan = await api.getStudyPlan(Number(params.arg));
  if (!plan) {
    root.append(h('div', { class: 'screen message' },
      h('h1', { class: 'big-text', tabindex: '-1' }, 'That study isn’t available.'),
      h('button', { class: 'pill primary', type: 'button', onclick: () => ctx.go('#/studies') }, 'Choose a study')));
    return null;
  }
  // Resume where this tablet left off (e.g. after a reload or the tablet slept).
  const saved = ctx.store.studyStep();
  return runStudy(root, plan, ctx, {
    startAt: saved.planId === plan.id ? saved.index : 0,
    onStep: (index) => ctx.store.setStudyStep({ planId: plan.id, index }),
    onExit: () => ctx.go('#/'),
    onFinish: () => { ctx.store.finishStudy(plan.id, plan.title); ctx.go('#/done'); },
  });
}
