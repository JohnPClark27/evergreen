// Prayers (admins): the prayer library. Every prayer needs a SOURCE (where the text comes
// from); paste the text from that source, never write it. The database refuses a blank source.
import * as db from '../db.js';
import { chip, flash, h } from '../ui.js';

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function render(main, _params, app) {
  let prayers = await db.allPrayers();
  const status = h('p', { role: 'status', hidden: true });
  const list = h('div', { class: 'palette' });
  const form = h('form', { class: 'panel' });
  let current = null;

  function drawList() {
    list.replaceChildren(
      h('button', { class: 'btn primary', type: 'button', onclick: () => edit(null) }, '+ New prayer'),
      ...prayers.map((p) => h('button', { class: 'palette-btn', type: 'button', 'aria-current': current?.id === p.id ? 'true' : null, onclick: () => edit(p) },
        h('span', { class: 'item-icon', 'aria-hidden': 'true' }, '✦'), h('strong', {}, p.title),
        h('small', {}, `${p.attribution ?? p.source} · ${p.status}`))));
  }

  function edit(p) {
    current = p;
    const v = { title: p?.title ?? '', slug: p?.slug ?? '', source: p?.source ?? '', attribution: p?.attribution ?? '',
      section: p?.section ?? '', text: p?.text ?? '', status: p?.status ?? 'draft' };
    const input = (key, label, opts = {}) => {
      const el = h(opts.area ? 'textarea' : 'input', { class: 'input', id: `p-${key}`, maxlength: opts.max ?? '200', required: opts.required ?? false,
        placeholder: opts.placeholder ?? '', oninput: (e) => { v[key] = e.target.value; if (key === 'title' && !p) { v.slug = slugify(v.title); slug.value = v.slug; } app.dirty = () => true; } });
      el.value = v[key];
      if (opts.area) el.rows = 10;
      return [h('div', { class: 'field' }, h('label', { class: 'field-label', for: `p-${key}` }, label), el, opts.hint && h('p', { class: 'field-hint' }, opts.hint)), el];
    };
    const [titleField] = input('title', 'Title', { required: true });
    const [slugField, slug] = input('slug', 'Short name (slug)', { required: true, hint: 'Lowercase words with dashes, e.g. evening-collect.' });
    const [sourceField] = input('source', 'Source (required)', { required: true, max: '300', placeholder: 'e.g. The Book of Common Prayer (1979), p. 832', hint: 'Where this exact text comes from. Shown with the prayer in Evergreen.' });
    const [attrField] = input('attribution', 'Attribution line shown with the prayer', { placeholder: 'e.g. The Book of Common Prayer (1979)' });
    const [sectionField] = input('section', 'Section (optional)');
    const [textField] = input('text', 'Prayer text (pasted from the source)', { area: true, max: '4000', required: true });
    const statusSel = h('select', { class: 'input', id: 'p-status', onchange: (e) => { v.status = e.target.value; app.dirty = () => true; } },
      ['draft', 'published', 'archived'].map((s) => h('option', { value: s, selected: v.status === s }, s)));
    form.replaceChildren(...[
      h('h2', {}, p ? `Edit: ${p.title}` : 'New prayer'),
      p && chip(p.status),
      titleField, slugField, sourceField, attrField, sectionField, textField,
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'p-status' }, 'Status'), statusSel),
      h('button', { class: 'btn primary', type: 'submit' }, 'Save prayer'),
    ].filter(Boolean)); // replaceChildren would print null as text
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!v.source.trim()) return flash(status, 'A prayer needs a source.', 'error');
      try {
        const [row] = await db.savePrayer(p?.id, {
          title: v.title.trim(), slug: v.slug.trim(), source: v.source.trim(), attribution: v.attribution.trim() || null,
          section: v.section.trim() || null, text: v.text.trim(), status: v.status });
        prayers = await db.allPrayers();
        app.dirty = null;
        flash(status, `Saved “${row.title}”.`);
        edit(prayers.find((x) => x.id === row.id));
        drawList();
      } catch (err) { flash(status, err.message, 'error'); }
    };
    drawList();
  }

  main.append(
    h('div', { class: 'toolbar' }, h('h1', {}, 'Prayers')),
    h('p', { class: 'muted' }, 'Plans can only use published prayers from this library.'),
    status,
    h('div', { class: 'editor' }, form, h('aside', {}, list)));
  edit(prayers[0] ?? null);
  return () => { app.dirty = null; };
}
