// Account: the name admins see next to your plans.
import * as db from '../db.js';
import { flash, h } from '../ui.js';

export async function render(main, _params, app) {
  const status = h('p', { role: 'status', hidden: true });
  const name = h('input', { class: 'input', id: 'name', maxlength: '80', value: app.profile?.display_name ?? '' });
  const form = h('form', { class: 'panel' },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'name' }, 'Your name'), name,
      h('p', { class: 'field-hint' }, 'Shown to admins when they review your plans. Residents never see it.')),
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await db.setDisplayName(name.value); app.profile.display_name = name.value.trim(); flash(status, 'Saved.'); } catch (err) { flash(status, err.message, 'error'); }
  });
  main.append(h('h1', {}, 'Your account'), h('p', { class: 'muted' }, `Signed in as ${(await db.session()).user.email}. Role: ${app.profile?.role ?? 'author'}.`), status, form);
}
