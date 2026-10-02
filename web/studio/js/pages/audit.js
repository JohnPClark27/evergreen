// Audit log (admins): who changed what, newest first, with a field-by-field view.
import * as db from '../db.js';
import { h, when } from '../ui.js';

const TABLES = [['', 'All'], ['study_plans', 'Plans'], ['study_plan_items', 'Plan modules'], ['hymns', 'Hymns'], ['prayers', 'Prayers'], ['profiles', 'People']];
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 120 ? `${s.slice(0, 119)}…` : s ?? ''; };

function changes(before, after) {
  if (!before || !after) return null;
  return Object.keys({ ...before, ...after })
    .filter((k) => k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => h('li', {}, h('strong', {}, k), `: ${short(before[k])} → ${short(after[k])}`));
}

export async function render(main, params) {
  const table = params.table ?? '';
  const rows = await db.auditLog(table || null);
  main.append(
    h('div', { class: 'toolbar' }, h('h1', {}, 'Audit log')),
    h('nav', { class: 'btn-row', 'aria-label': 'Filter by table' }, TABLES.map(([key, label]) =>
      h('a', { class: `btn small${key === table ? ' primary' : ''}`, href: `#/audit${key ? `?table=${key}` : ''}`, 'aria-current': key === table ? 'page' : null }, label))),
    h('p', {}),
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['When', 'Who', 'What', 'Details'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, rows.map((r) => {
        const diff = changes(r.before, r.after);
        return h('tr', {},
          h('td', { class: 'small' }, when(r.at)),
          h('td', { class: 'small' }, r.actor),
          h('td', { class: 'small' }, `${r.action} ${r.table_name} ${r.row_id ?? ''}`),
          h('td', { class: 'small' }, diff?.length ? h('ul', {}, diff)
            : h('details', {}, h('summary', {}, r.before ? 'Before' : 'Details'), h('pre', { class: 'small' }, JSON.stringify(r.after ?? r.before, null, 1)))));
      }))));
}
