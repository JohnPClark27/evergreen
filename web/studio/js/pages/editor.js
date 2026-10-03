// Plan editor (#/plan/new, #/plan/<id>): title + description; the plan's STUDIES (add, rename,
// reorder, copy, remove, or copy one from another plan); for the selected study, an outline of
// its modules in any order and combination with an "Add a module" palette; Save / Preview /
// Submit; and (for admins on a submitted plan) the review panel.
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
  const toItem = (i) => ({ key: nextKey++, module_type: i.module_type, config: clone(i.config ?? {}), open: false });
  // Every study keeps its own module list. `items` is the SELECTED study's list: the module
  // outline, palette, and drag-and-drop below all work on it.
  const studies = (loaded?.studies ?? []).map((st) => ({ key: nextKey++, title: st.title, items: st.items.map(toItem) }));
  if (!studies.length) studies.push({ key: nextKey++, title: 'Study 1', items: [] });
  let current = 0;
  let items = studies[0].items;
  const editable = plan.status === 'draft' || isAdmin;
  const snapshot = () => JSON.stringify({
    t: plan.title.trim(), d: (plan.description ?? '').trim(),
    s: studies.map((st) => [st.title.trim(), st.items.map((x) => [x.module_type, x.config])]),
  });
  let saved = isNew ? null : snapshot();
  app.dirty = () => editable && snapshot() !== saved;

  // ---------- validation ----------
  const errorsOf = (item) => {
    const mod = moduleFor(item.module_type);
    return mod ? mod.validate(item.config, lib) : [];
  };
  // Things that stop SAVING (missing titles, modules that are filled in wrongly)…
  const planErrors = () => [
    !plan.title.trim() && 'Give the plan a title.',
    ...studies.flatMap((st, k) => [
      !st.title.trim() && `Study ${k + 1} needs a title.`,
      ...st.items.flatMap((item, n) => errorsOf(item).map((e) =>
        `Study ${k + 1}, part ${n + 1} (${moduleFor(item.module_type)?.name ?? item.module_type}): ${e}`)),
    ]),
  ].filter(Boolean);
  // …and things that also stop SUBMITTING (an empty study is fine while drafting).
  const submitErrors = () => [
    ...planErrors(),
    ...studies.map((st, k) => !st.items.length && `Study ${k + 1} (“${st.title || 'untitled'}”) has no modules yet.`),
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
  const studyList = h('ol', { class: 'study-tabs', 'aria-label': 'Studies in this plan' });
  const studyTitle = h('input', { class: 'input', id: 'study-title', maxlength: '120', disabled: !editable,
    placeholder: 'e.g. “Week 1: The Lord is my shepherd”',
    oninput: (e) => { studies[current].title = e.target.value; drawStudies(); refreshActions(); } });
  const studyHeading = h('h2', {});
  const studyAdd = editable && h('div', { class: 'btn-row' },
    h('button', { class: 'btn small', type: 'button', onclick: () => addStudy() }, '+ Add a study'),
    h('button', { class: 'btn small', type: 'button', onclick: () => copyFromOtherPlan() }, 'Copy a study from another plan…'));

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
        h('section', { class: 'panel', 'aria-label': 'Studies' },
          h('h2', {}, 'Studies'),
          h('p', { class: 'muted small' }, 'A plan holds one or more studies. On the tablet, people pick the plan, then walk through its studies (their progress is kept on the tablet).'),
          studyList, studyAdd),
        h('section', { class: 'panel study-panel', 'aria-label': 'Selected study' },
          h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'study-title' }, 'Study title'), studyTitle),
          studyHeading,
          h('p', { class: 'muted small' }, editable ? 'Drag ☰ (or use ▲ ▼) to reorder. Any mix, any order: two hymns in a row is fine.' : ''),
          outline)),
      h('aside', { class: 'sticky' },
        editable && h('section', { class: 'panel' }, h('h2', {}, 'Add a module to this study'),
          h('div', { class: 'palette' }, MODULES.map((m) => h('button', { class: 'palette-btn', type: 'button',
            onclick: () => addItem(m) },
          h('span', { class: 'item-icon', 'aria-hidden': 'true' }, m.icon),
          h('strong', {}, m.name),
          h('small', {}, m.description))))),
        h('section', { class: 'panel' }, h('h2', {}, 'Plan'), actions),
        reviewBox)),
  ].filter(Boolean)); // statusBanner may be null

  // ---------- studies ----------
  function selectStudy(k) {
    current = Math.max(0, Math.min(k, studies.length - 1));
    items = studies[current].items;
    studyTitle.value = studies[current].title;
    drawStudies();
    drawOutline();
  }

  function drawStudies() {
    const sbtn = (label, aria, fn, disabled = false) =>
      h('button', { class: 'btn small', type: 'button', 'aria-label': aria, title: aria, disabled: disabled || !editable, onclick: fn }, label);
    studyList.replaceChildren(...studies.map((st, k) => {
      const errs = st.items.some((x) => errorsOf(x).length) || !st.title.trim();
      return h('li', { class: `study-tab${k === current ? ' current' : ''}${errs ? ' has-errors' : ''}` },
        h('button', { class: 'study-pick', type: 'button', 'aria-current': k === current ? 'true' : null, onclick: () => selectStudy(k) },
          h('span', { class: 'item-num' }, `${k + 1}.`),
          h('span', { class: 'study-pick-title' }, st.title.trim() || 'Untitled study'),
          h('span', { class: 'muted small' }, `${st.items.length} module${st.items.length === 1 ? '' : 's'}`)),
        sbtn('▲', `Move study ${k + 1} up`, () => moveStudy(k, k - 1), k === 0),
        sbtn('▼', `Move study ${k + 1} down`, () => moveStudy(k, k + 1), k === studies.length - 1),
        sbtn('Copy', `Duplicate study ${k + 1}`, () => {
          studies.splice(k + 1, 0, { key: nextKey++, title: `${st.title} (copy)`.slice(0, 120), items: st.items.map((x) => ({ ...toItem(x) })) });
          selectStudy(k + 1);
        }),
        sbtn('✕', `Remove study ${k + 1}`, async () => {
          if (studies.length === 1) { flash(status, 'A plan needs at least one study.', 'error'); return; }
          if (await ask(`Remove study ${k + 1} (“${st.title || 'untitled'}”) and its ${st.items.length} module(s)?`, { ok: 'Remove', danger: true })) {
            studies.splice(k, 1);
            selectStudy(Math.min(current, studies.length - 1));
          }
        }));
    }));
    studyHeading.textContent = `Modules in study ${current + 1}`;
    refreshActions();
  }

  function moveStudy(from, to) {
    if (to < 0 || to >= studies.length) return;
    const [x] = studies.splice(from, 1);
    studies.splice(to, 0, x);
    selectStudy(to);
    studyList.children[to]?.querySelector('.study-pick')?.focus();
  }

  function addStudy(title = `Study ${studies.length + 1}`, fromItems = []) {
    studies.push({ key: nextKey++, title, items: fromItems.map(toItem) });
    selectStudy(studies.length - 1);
    studyTitle.focus();
    studyTitle.select();
  }

  /** Pick a study from one of your plans (or any published plan) and add a copy here. */
  async function copyFromOtherPlan() {
    let plans;
    try { plans = (await db.plansToCopyFrom()).filter((p) => p.id !== plan.id); } catch (err) { flash(status, err.message, 'error'); return; }
    if (!plans.length) { flash(status, 'There are no other plans with studies to copy from yet.', 'error'); return; }
    const planSel = h('select', { class: 'input', id: 'copy-plan' }, plans.map((p, i) => h('option', { value: String(i) }, `${p.title}${p.status === 'published' ? '' : ` (${p.status})`}`)));
    const studySel = h('select', { class: 'input', id: 'copy-study' });
    const fillStudies = () => studySel.replaceChildren(...plans[Number(planSel.value)].studies.map((st, i) =>
      h('option', { value: String(i) }, `${i + 1}. ${st.title} (${st.items.length} modules)`)));
    planSel.addEventListener('change', fillStudies);
    fillStudies();
    const dlg = h('dialog', { class: 'studio-dialog' },
      h('form', { method: 'dialog' },
        h('h2', {}, 'Copy a study from another plan'),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'copy-plan' }, 'Plan'), planSel),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'copy-study' }, 'Study'), studySel),
        h('p', { class: 'muted small' }, 'A copy is added to the end of this plan. Changing it later won’t change the original.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', value: 'cancel' }, 'Cancel'),
          h('button', { class: 'btn primary', value: 'ok' }, 'Copy study'))));
    dlg.addEventListener('close', () => {
      dlg.remove();
      if (dlg.returnValue !== 'ok') return;
      const st = plans[Number(planSel.value)].studies[Number(studySel.value)];
      addStudy(st.title, st.items);
      flash(status, `Copied “${st.title}” into this plan (not saved yet).`);
    });
    document.body.append(dlg);
    dlg.showModal();
    planSel.focus();
  }

  // ---------- outline ----------
  function drawOutline() {
    outline.replaceChildren(...items.map((item, n) => itemCard(item, n)));
    if (!items.length) outline.append(h('li', { class: 'panel muted' }, editable ? 'Add modules to this study from the list on the right.' : 'No modules.'));
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
      studyList.children[current]?.classList.toggle('has-errors', studies[current].items.some((x) => errorsOf(x).length) || !studies[current].title.trim());
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
        btn('Copy', `Duplicate part ${n + 1}`, () => { items.splice(n + 1, 0, { ...item, key: nextKey++, config: clone(item.config), open: false }); drawOutline(); drawStudies(); }),
        btn('✕', `Remove part ${n + 1}`, async () => {
          if (await ask(`Remove part ${n + 1} (${mod?.name ?? item.module_type})?`, { ok: 'Remove', danger: true })) { items.splice(n, 1); drawOutline(); drawStudies(); }
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
    drawStudies();
    outline.lastElementChild?.scrollIntoView({ block: 'center' });
    outline.lastElementChild?.querySelector('input, select, textarea')?.focus();
  }

  // ---------- actions ----------
  function refreshActions() {
    const dirty = app.dirty();
    const errs = submitErrors();
    const b = (label, fn, { primary = false, danger = false, disabled = false, hint = null } = {}) =>
      h('button', { class: `btn${primary ? ' primary' : ''}${danger ? ' danger' : ''}`, type: 'button', disabled, title: hint, onclick: fn }, label);
    actions.replaceChildren(...[
      editable && b(dirty || isNew ? 'Save' : 'Saved', save, { primary: true, disabled: !(dirty || isNew) }),
      b(`Preview study ${current + 1}`, preview, { disabled: !items.length }),
      plan.id && plan.status === 'draft' && b('Submit for review', submit, {
        disabled: dirty || errs.length > 0,
        hint: dirty ? 'Save first' : errs.length ? 'Fix the things listed below first' : 'An admin will review it',
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
      errs.length > 0 && editable && h('details', { class: 'small' },
        h('summary', {}, `${errs.length} thing${errs.length === 1 ? '' : 's'} to fix before submitting`),
        h('ul', {}, errs.map((e) => h('li', {}, e)))),
    ].filter(Boolean)); // replaceChildren would print false/null as text
  }

  async function save() {
    const errs = planErrors();
    if (errs.length) {
      flash(status, `Fix these first: ${errs.join(' · ')}`, 'error');
      // jump to the first study with a problem and open the module
      const k = studies.findIndex((st) => !st.title.trim() || st.items.some((x) => errorsOf(x).length));
      if (k >= 0) {
        const bad = studies[k].items.find((x) => errorsOf(x).length);
        if (bad) bad.open = true;
        selectStudy(k);
      }
      return;
    }
    try {
      const id = await db.savePlan(plan.id, plan.title.trim(), plan.description?.trim(), studies);
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
      const id = await db.savePlan(null, `${plan.title.trim()} (copy)`.slice(0, 120), plan.description?.trim(), studies);
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
    // The selected study, exactly as a tablet would play it (unsaved changes included).
    const st = studies[current];
    sessionStorage.setItem('hr.preview', JSON.stringify({
      id: plan.id ?? 0, title: st.title || 'Preview', subtitle: `Study ${current + 1} of ${studies.length}`,
      items: st.items.map((x) => ({ module_type: x.module_type, config: x.config })),
    }));
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
  selectStudy(0);
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
