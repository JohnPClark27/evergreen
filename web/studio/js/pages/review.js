// Review (admins): plans waiting for review first, then every plan by status.
import * as db from '../db.js';
import { chip, flash, h, when } from '../ui.js';

export async function render(main, params) {
  const filter = params.status ?? 'pending';
  const plans = await db.allPlans(filter === 'all' ? null : filter);
  const status = h('p', { role: 'status', hidden: true });
  const msg = sessionStorage.getItem('hr.studio.flash');
  if (msg) { sessionStorage.removeItem('hr.studio.flash'); flash(status, msg); }

  const tabs = [['pending', 'Waiting for review'], ['published', 'Live'], ['draft', 'Drafts'], ['archived', 'Archived'], ['all', 'All']];
  main.append(
    h('div', { class: 'toolbar' }, h('h1', {}, 'Review study plans')),
    status,
    h('nav', { class: 'btn-row', 'aria-label': 'Filter by status' }, tabs.map(([key, label]) =>
      h('a', { class: `btn small${key === filter ? ' primary' : ''}`, href: `#/review?status=${key}`, 'aria-current': key === filter ? 'page' : null }, label))),
    h('p', {}),
    plans.length
      ? h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['Plan', 'Author', 'Modules', 'Status', filter === 'pending' ? 'Submitted' : 'Updated'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, plans.map((p) => h('tr', {},
          h('td', {}, h('a', { href: `#/plan/${p.id}` }, p.title)),
          h('td', {}, p.owner?.display_name || (p.owner_id ? 'An author' : 'Imported')),
          h('td', {}, String(p.items.length)),
          h('td', {}, chip(p.status)),
          h('td', { class: 'small muted' }, when(filter === 'pending' ? p.submitted_at : p.updated_at))))))
      : h('p', { class: 'panel muted' }, filter === 'pending' ? 'Nothing is waiting for review.' : 'No plans here.'));
}
