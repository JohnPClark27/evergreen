// Plan editor (#/plan/new, #/plan/<id>): title + description, an outline of modules in any
// order and combination, an "Add a module" palette, Save / Preview / Submit, and (for admins
// on a submitted plan) the review panel.
import * as db from '../db.js';
import { MODULES, moduleFor } from '../../../modules/index.js';
import { ask, chip, flash, h } from '../ui.js';

let nextKey = 1;
const clone = (x) => JSON.parse(JSON.stringify(x));

export async function render(main, params, app) {
  const isNew = params.arg === 'new';
  const isAdmin = app.profile?.role === 'admin';
  const [lib, loaded] = await Promise.all([db.loadLibrary(), isNew ? null : db.getPlan(Number(params.arg))]);
  if (!isNew && !loaded) {
    main.append(h('h1', {}, 'Plan not found'), h('p', {}, 'It may have been deleted, or it isn’t yours.'), h('a', { href: '#/plans' }, 'My plans'));
    return null;
  }

  const plan = loaded ?? { id: null, title: '', description: '', status: 'draft', review_note: null };
  let items = (loaded?.items ?? []).map((i) => ({ key: nextKey++, module_type: i.module_type, config: clone(i.config ?? {}), open: false }));
  const editable = plan.status === 'draft' || isAdmin;
  const snapshot = () => JSON.stringify({ t: plan.title.trim(), d: (plan.description ?? '').trim(), i: items.map((x) => [x.module_type, x.config]) });
  let saved = isNew ? null : snapshot();
  app.dirty = () => editable && snapshot() !== saved;

  // ---------- validation ----------
  const errorsOf = (item) => {
    const mod = moduleFor(item.module_type);
    return mod ? mod.validate(item.config, lib) : [];
  };
  const planErrors = () => [
    !plan.title.trim() && 'Give the plan a title.',
    ...items.flatMap((item, n) => errorsOf(item).map((e) => `Part ${n + 1} (${moduleFor(item.module_type)?.name ?? item.module_type}): ${e}`)),
  ].filter(Boolean);

  // ---------- layout ----------
  const status = h('p', { role: 'status', hidden: true });
  const outline = h('ol', { class: 'outline', 'aria-label': 'Modules in this plan' });
  const title = h('input', { class: 'input', id: 'plan-title', maxlength: '120', value: plan.title, disabled: !editable,
    placeholder: 'e.g. “Comfort in the evening”', oninput: (e) => { plan.title = e.target.value; refreshActions(); } });
  const desc = h('textarea', { class: 'input', id: 'plan-desc', maxlength: '500', rows: '2', disabled: !editable,
    placeholder: 'One line for the tablet’s list (optional)', oninput: (e) => { plan.description = e.target.value; refreshActions(); } });
  desc.value = plan.description ?? '';
  const actions = h('div', { class: 'btn-row' });
  const reviewBox = h('div');

  main.append(...[
    h('div', { class: 'toolbar' },
      h('h1', {}, isNew ? 'New study plan' : plan.title || 'Untitled plan'),
      chip(plan.status),
      h('a', { class: 'btn', href: '#/plans' }, '← My plans')),
    statusBanner(plan, isAdmin),
    status,
    h('div', { class: 'editor' },
      h('div', {},
        h('section', { class: 'panel', 'aria-label': 'Plan details' },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'plan-title' }, 'Title'), title),
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'plan-desc' }, 'Description'), desc)),
        h('h2', {}, 'Modules'),
        h('p', { class: 'muted small' }, editable ? 'Drag ☰ (or use ▲ ▼) to reorder. Any mix, any order: two hymns in a row is fine.' : ''),
        outline),
      h('aside', { class: 'sticky' },
        editable && h('section', { class: 'panel' }, h('h2', {}, 'Add a module'),
          h('div', { class: 'palette' }, MODULES.map((m) => h('button', { class: 'palette-btn', type: 'button',
            onclick: () => addItem(m) },
          h('span', { class: 'item-icon', 'aria-hidden': 'true' }, m.icon),
          h('strong', {}, m.name),
          h('small', {}, m.description))))),
        h('section', { class: 'panel' }, h('h2', {}, 'Plan'), actions),
        reviewBox)),
  ].filter(Boolean)); // statusBanner may be null

  // ---------- outline ----------
  function drawOutline() {
    outline.replaceChildren(...items.map((item, n) => itemCard(item, n)));
    if (!items.length) outline.append(h('li', { class: 'panel muted' }, editable ? 'Add modules from the list on the right.' : 'No modules.'));
    refreshActions();
  }

  function itemCard(item, n) {
    const mod = moduleFor(item.module_type);
    const summary = h('div', { class: 'item-summary' });
    const errs = h('div', { class: 'item-errors', 'aria-live': 'polite' });
    const body = h('div', { class: 'item-body', hidden: !item.open || !mod });
    const li = h('li', { class: 'item', 'data-key': String(item.key) });

    const refreshHead = () => {
      summary.textContent = mod ? mod.summary(item.config, lib) : `This module (“${item.module_type}”) isn’t available any more.`;
      const e = errorsOf(item);
      errs.textContent = e.join(' ');
      errs.hidden = !e.length;
      li.classList.toggle('has-errors', e.length > 0);
      refreshActions();
    };
    const drawBody = () => {
      if (!mod || !item.open) return;
      body.replaceChildren(mod.editor(item.config, {
        lib,
        get: () => item.config,
        set: (patch, { redraw = false } = {}) => {
          item.config = { ...item.config, ...patch };
          refreshHead();
          if (redraw) drawBody();
        },
      }));
      if (!editable) body.querySelectorAll('input, select, textarea, button').forEach((x) => { x.disabled = true; });
    };

    const btn = (label, aria, fn, disabled = false) =>
      h('button', { class: 'btn small', type: 'button', 'aria-label': aria, title: aria, disabled: disabled || !editable, onclick: fn }, label);
    const toggle = h('button', { class: 'btn small', type: 'button', 'aria-expanded': String(item.open), disabled: !mod,
      onclick: () => { item.open = !item.open; toggle.textContent = item.open ? 'Done' : editable ? 'Edit' : 'View';
        toggle.setAttribute('aria-expanded', String(item.open)); body.hidden = !item.open; drawBody(); } },
    item.open ? 'Done' : editable ? 'Edit' : 'View');
    const grip = h('span', { class: 'grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, '☰');

    li.append(
      h('div', { class: 'item-head' },
        editable && grip,
        h('span', { class: 'item-num' }, `${n + 1}.`),
        h('span', { class: 'item-icon', 'aria-hidden': 'true' }, mod?.icon ?? '?'),
        h('div', { class: 'item-text' }, h('div', { class: 'item-name' }, mod?.name ?? item.module_type), summary),
        btn('▲', `Move part ${n + 1} up`, () => move(n, n - 1), n === 0),
        btn('▼', `Move part ${n + 1} down`, () => move(n, n + 1), n === items.length - 1),
        btn('Copy', `Duplicate part ${n + 1}`, () => { items.splice(n + 1, 0, { ...item, key: nextKey++, config: clone(item.config), open: false }); drawOutline(); }),
        btn('✕', `Remove part ${n + 1}`, async () => {
          if (await ask(`Remove part ${n + 1} (${mod?.name ?? item.module_type})?`, { ok: 'Remove', danger: true })) { items.splice(n, 1); drawOutline(); }
        }),
        toggle),
      errs, body);

    // Drag and drop (mouse/touch); ▲ ▼ do the same for keyboards and screen readers.
    if (editable) {
      grip.addEventListener('pointerdown', () => { li.draggable = true; });
      li.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(n)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => { li.draggable = false; li.classList.remove('dragging'); outline.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before')); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drop-before'); });
      li.addEventListener('dragleave', () => li.classList.remove('drop-before'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isNaN(from)) move(from, from < n ? n - 1 : n);
      });
    }
    refreshHead();
    drawBody();
    return li;
  }

  function move(from, to) {
    if (to < 0 || to >= items.length || from === to) return;
    const [x] = items.splice(from, 1);
    items.splice(to, 0, x);
    drawOutline();
    outline.children[to]?.querySelector('.btn')?.focus();
  }

  function addItem(mod) {
    items.push({ key: nextKey++, module_type: mod.type, config: mod.defaults(), open: true });
    drawOutline();
    outline.lastElementChild?.scrollIntoView({ block: 'center' });
    outline.lastElementChild?.querySelector('input, select, textarea')?.focus();
  }

  // ---------- actions ----------
  function refreshActions() {
    const dirty = app.dirty();
    const errs = planErrors();
    const b = (label, fn, { primary = false, danger = false, disabled = false, hint = null } = {}) =>
      h('button', { class: `btn${primary ? ' primary' : ''}${danger ? ' danger' : ''}`, type: 'button', disabled, title: hint, onclick: fn }, label);
    actions.replaceChildren(...[
      editable && b(dirty || isNew ? 'Save' : 'Saved', save, { primary: true, disabled: !(dirty || isNew) }),
      b('Preview', preview, { disabled: !items.length }),
      plan.id && plan.status === 'draft' && b('Submit for review', submit, {
        disabled: dirty || errs.length > 0 || !items.length,
        hint: dirty ? 'Save first' : errs.length ? 'Fix the parts marked in red first' : 'An admin will review it',
      }),
      plan.id && plan.status === 'pending' && b('Withdraw (edit again)', () => setStatus('draft', 'Withdrawn: you can edit it again.')),
      plan.id && plan.status === 'published' && b('Take back to edit', async () => {
        if (await ask('Take this plan back to draft? It leaves the tablets until an admin approves it again.', { ok: 'Take back' })) {
          setStatus('draft', 'It’s a draft again (not on the tablets).');
        }
      }),
      plan.id && b('Duplicate', duplicate),
      plan.id && plan.status === 'published' && b('Archive', () => setStatus('archived', 'Archived: removed from the tablets.')),
      plan.id && plan.status === 'archived' && b('Restore as draft', () => setStatus('draft', 'Restored as a draft.')),
      plan.id && ['draft', 'archived'].includes(plan.status) && b('Delete', remove, { danger: true }),
      errs.length > 0 && editable && h('p', { class: 'muted small' }, `${errs.length} thing${errs.length === 1 ? '' : 's'} to fix before submitting.`),
    ].filter(Boolean)); // replaceChildren would print false/null as text
  }

  async function save() {
    const errs = planErrors();
    if (errs.length) {
      flash(status, `Fix these first: ${errs.join(' · ')}`, 'error');
      const bad = items.find((x) => errorsOf(x).length);
      if (bad && !bad.open) { bad.open = true; drawOutline(); }
      return;
    }
    try {
      const id = await db.savePlan(plan.id, plan.title.trim(), plan.description?.trim(), items);
      saved = snapshot();
      if (!plan.id) { app.dirty = null; app.go(`#/plan/${id}`); return; }
      flash(status, 'Saved.');
      refreshActions();
    } catch (err) {
      flash(status, err.message, 'error');
    }
  }

  async function setStatus(next, message) {
    try {
      await db.setPlanStatus(plan.id, next);
      app.dirty = null;
      sessionStorage.setItem('hr.studio.flash', message);
      window.dispatchEvent(new HashChangeEvent('hashchange')); // reload this page
    } catch (err) { flash(status, err.message, 'error'); }
  }

  async function submit() {
    if (await ask('Submit this plan for review? You can’t edit it while it’s waiting (you can withdraw it).', { ok: 'Submit' })) {
      setStatus('pending', 'Submitted. An admin will review it; you’ll see their note here if they send it back.');
    }
  }

  async function duplicate() {
    try {
      const id = await db.savePlan(null, `${plan.title.trim()} (copy)`.slice(0, 120), plan.description?.trim(), items);
      app.dirty = null;
      app.go(`#/plan/${id}`);
    } catch (err) { flash(status, err.message, 'error'); }
  }

  async function remove() {
    if (await ask(`Delete “${plan.title}” for good?`, { ok: 'Delete', danger: true })) {
      try { await db.deletePlan(plan.id); app.dirty = null; app.go('#/plans'); } catch (err) { flash(status, err.message, 'error'); }
    }
  }

  /** Preview = the real tablet app, in a frame, playing these (unsaved) modules. */
  function preview() {
    sessionStorage.setItem('hr.preview', JSON.stringify({ id: plan.id ?? 0, title: plan.title || 'Preview', items: items.map((x) => ({ module_type: x.module_type, config: x.config })) }));
    const frame = h('iframe', { class: 'preview-frame', src: '../#/preview', title: 'Tablet preview', allow: 'autoplay' });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const overlay = h('div', { class: 'preview', role: 'dialog', 'aria-label': 'Tablet preview' },
      h('div', {},
        h('div', { class: 'preview-bar' }, h('strong', {}, 'Preview: what the tablet shows'), h('button', { class: 'btn', type: 'button', onclick: close }, 'Close preview')),
        frame));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', function onMsg(e) { if (e.data === 'hr-preview-close') { close(); window.removeEventListener('message', onMsg); } });
  }

  // ---------- admin review panel ----------
  async function drawReview() {
    if (!(isAdmin && plan.status === 'pending')) return;
    const problems = await db.planProblems(plan.id).catch((e) => [e.message]);
    const moduleProblems = planErrors();
    const all = [...problems, ...moduleProblems];
    reviewBox.replaceChildren(h('section', { class: 'panel' },
      h('h2', {}, 'Review'),
      h('p', { class: 'small muted' }, `Submitted by ${plan.owner?.display_name || 'an author'}. Preview it, then approve or send it back.`),
      all.length
        ? h('div', { class: 'banner warn small' }, h('strong', {}, 'Can’t publish yet:'), h('ul', {}, all.map((p) => h('li', {}, p))))
        : h('p', { class: 'banner ok small' }, 'Nothing blocks publishing.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', disabled: all.length > 0, onclick: async () => {
          try { await db.reviewPlan(plan.id, true); sessionStorage.setItem('hr.studio.flash', 'Approved: it’s live on the tablets.'); app.go('#/review'); } catch (e) { flash(status, e.message, 'error'); }
        } }, 'Approve and publish'),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          const note = await ask('Send it back to the author. What should they change?', { ok: 'Send back', input: true, placeholder: 'A short, kind note' });
          if (note === null) return;
          try { await db.reviewPlan(plan.id, false, note); sessionStorage.setItem('hr.studio.flash', 'Sent back to the author.'); app.go('#/review'); } catch (e) { flash(status, e.message, 'error'); }
        } }, 'Send back with a note'))));
  }

  const pending = sessionStorage.getItem('hr.studio.flash');
  if (pending) { sessionStorage.removeItem('hr.studio.flash'); flash(status, pending); }
  drawOutline();
  drawReview();
  if (isNew) title.focus();
  return () => { app.dirty = null; };
}

function statusBanner(plan, isAdmin) {
  if (plan.status === 'draft' && plan.review_note) {
    return h('p', { class: 'banner warn' }, h('strong', {}, 'Sent back by an admin: '), plan.review_note);
  }
  if (plan.status === 'pending') {
    return h('p', { class: 'banner' }, isAdmin
      ? 'Waiting for review. You can edit it as an admin, or approve / send it back below.'
      : 'Waiting for review. Withdraw it if you want to make changes.');
  }
  if (plan.status === 'published') {
    return h('p', { class: 'banner ok' }, 'Live on the tablets.', isAdmin ? '' : ' To change it, take it back to draft (it leaves the tablets until approved again).');
  }
  if (plan.status === 'archived') return h('p', { class: 'banner' }, 'Archived: not on the tablets.');
  return null;
}
