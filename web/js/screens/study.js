// One study inside a plan (#/study/<planId>/<n>, n = 1-based study number): the runner
// plays its modules; Finish ticks it on this tablet and goes to "done".
import * as api from '../api.js';
import { gameHash, gameTarget } from '../game-link.js';
import { runStudy } from '../runner.js';
import { h } from '../ui.js';

export async function render(root, params, ctx) {
  const plan = await api.getStudyPlan(Number(params.arg));
  const study = plan?.studies[Number(params.arg2) - 1];
  if (!study) {
    root.append(h('div', { class: 'screen message' },
      h('h1', { class: 'big-text', tabindex: '-1' }, 'That study isn’t available.'),
      h('button', { class: 'pill primary', type: 'button', onclick: () => ctx.go(plan ? `#/plan/${plan.id}` : '#/studies') },
        plan ? 'Back to the plan' : 'Choose a study plan')));
    return null;
  }
  // Resume where this tablet left off (e.g. after a reload or the tablet slept).
  const saved = ctx.store.studyStep();
  const resume = saved.planId === plan.id && saved.studyKey === study.key;
  return runStudy(root, { id: study.id, title: `${study.title}`, subtitle: `Study ${study.position + 1} of ${plan.studies.length}`, items: study.items }, ctx, {
    startAt: resume ? saved.index : 0,
    exitLabel: 'Plan',
    onStep: (index) => ctx.store.setStudyStep({ planId: plan.id, studyKey: study.key, index }),
    onExit: () => ctx.go(`#/plan/${plan.id}`),
    // "Play a game about this": the game's "Back to study" returns here (the step is saved).
    onGame: (item, all) => ctx.go(gameHash('trivia', gameTarget(item, all), `#/study/${plan.id}/${study.position + 1}`)),
    onFinish: () => { ctx.store.finishStudy(plan.id, plan.title, study.key, study.title); ctx.go('#/done'); },
  });
}
