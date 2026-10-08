// My plans: the signed-in author's study plans, newest first.
import * as db from '../db.js';
import { moduleFor } from '../../../modules/index.js';
import { chip, h, when } from '../ui.js';

/** "3 studies · 9 modules" */
export function studyCount(p) {
  const s = (p.studies ?? []).length;
  const m = db.moduleTypes(p).length;
  return `${s} ${s === 1 ? 'study' : 'studies'} · ${m} module${m === 1 ? '' : 's'}`;
}

export async function render(main) {
  const plans = await db.myPlans();
  main.append(
    h('div', { class: 'toolbar' },
      h('h1', {}, 'My study plans'),
      h('a', { class: 'btn primary', href: '#/plan/new' }, '+ New study plan')),
    h('p', { class: 'muted' }, 'A study plan holds one or more studies (for example, one for each week). Build each study from any mix of modules: ',
      'hymns, Scripture, prayers, your own notes, gentle quizzes and games. When it’s ready, submit it for review; an admin approves it and it appears in Evergreen.'),
    plans.length
      ? h('div', { class: 'plan-list' }, plans.map((p) => h('a', { class: 'panel plan-card', href: `#/plan/${p.id}` },
        h('div', { class: 'btn-row' }, chip(p.status)),
        h('h3', {}, p.title),
        p.description && h('p', { class: 'muted small' }, p.description),
        h('p', { class: 'small' }, studyCount(p), ': ',
          db.moduleTypes(p).slice(0, 8).map((t) => moduleFor(t)?.icon ?? '·').join(' ')),
        p.status === 'draft' && p.review_note && h('p', { class: 'banner warn small' }, `Admin note: ${p.review_note}`),
        h('p', { class: 'muted small' }, `Updated ${when(p.updated_at)}`))))
      : h('div', { class: 'panel' }, h('p', {}, 'You haven’t made any study plans yet.'),
        h('a', { class: 'btn primary', href: '#/plan/new' }, 'Make your first study plan')));
}
