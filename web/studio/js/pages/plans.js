// My plans: the signed-in author's study plans, newest first.
import * as db from '../db.js';
import { moduleFor } from '../../../modules/index.js';
import { chip, h, when } from '../ui.js';

export async function render(main) {
  const plans = await db.myPlans();
  main.append(
    h('div', { class: 'toolbar' },
      h('h1', {}, 'My study plans'),
      h('a', { class: 'btn primary', href: '#/plan/new' }, '+ New study plan')),
    h('p', { class: 'muted' }, 'Build a plan from any mix of modules: hymns, Scripture, prayers, your own notes, gentle quizzes and games. ',
      'When it’s ready, submit it for review; an admin approves it and it appears on every tablet.'),
    plans.length
      ? h('div', { class: 'plan-list' }, plans.map((p) => h('a', { class: 'panel plan-card', href: `#/plan/${p.id}` },
        h('div', { class: 'btn-row' }, chip(p.status)),
        h('h3', {}, p.title),
        p.description && h('p', { class: 'muted small' }, p.description),
        h('p', { class: 'small' }, `${p.items.length} module${p.items.length === 1 ? '' : 's'}: `,
          p.items.slice(0, 6).map((i) => moduleFor(i.module_type)?.icon ?? '·').join(' ')),
        p.status === 'draft' && p.review_note && h('p', { class: 'banner warn small' }, `Admin note: ${p.review_note}`),
        h('p', { class: 'muted small' }, `Updated ${when(p.updated_at)}`))))
      : h('div', { class: 'panel' }, h('p', {}, 'You haven’t made any study plans yet.'),
        h('a', { class: 'btn primary', href: '#/plan/new' }, 'Make your first study plan')));
}
