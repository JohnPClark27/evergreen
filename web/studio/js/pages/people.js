// People (admins): everyone who has signed in, and who is an admin.
import * as db from '../db.js';
import { ask, flash, h, when } from '../ui.js';

export async function render(main, _params, app) {
  const status = h('p', { role: 'status', hidden: true });
  const tbody = h('tbody');
  async function draw() {
    const people = await db.listPeople();
    tbody.replaceChildren(...people.map((p) => h('tr', {},
      h('td', {}, p.display_name || h('span', { class: 'muted' }, '(no name)')),
      h('td', {}, p.email),
      h('td', {}, p.role),
      h('td', { class: 'small muted' }, when(p.created_at)),
      h('td', {}, p.id === app.profile?.id ? h('span', { class: 'muted small' }, 'you')
        : h('button', { class: 'btn small', type: 'button', onclick: async () => {
          const role = p.role === 'admin' ? 'author' : 'admin';
          if (!(await ask(role === 'admin'
            ? `Make ${p.email} an admin? Admins can publish plans and hymns, and manage people.`
            : `Make ${p.email} an author (no admin rights)?`, { ok: role === 'admin' ? 'Make admin' : 'Make author' }))) return;
          try { await db.setRole(p.id, role); flash(status, `${p.email} is now an ${role}.`); draw(); } catch (e) { flash(status, e.message, 'error'); }
        } }, p.role === 'admin' ? 'Make author' : 'Make admin')))));
  }
  main.append(
    h('div', { class: 'toolbar' }, h('h1', {}, 'People')),
    h('p', { class: 'muted' }, 'Anyone can sign in and build plans; only admins publish. Authors’ plans reach Evergreen only after review.'),
    status,
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Name', 'Email', 'Role', 'Joined', 'Action'].map((t) => h('th', { scope: 'col' }, t)))),
      tbody));
  await draw();
}
