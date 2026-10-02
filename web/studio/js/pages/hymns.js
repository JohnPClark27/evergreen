// Hymns (admins): publish / unpublish and mark familiar. Publishing re-checks the hymn's
// ABC file against the strict public-domain rule (pd.js) and needs audio; failures are refused.
import * as db from '../db.js';
import { pdCheck } from '../pd.js';
import { chip, flash, h } from '../ui.js';

export async function render(main) {
  let hymns = await db.allHymns();
  const status = h('p', { role: 'status', hidden: true });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search number or title…', 'aria-label': 'Search hymns' });
  const only = h('select', { class: 'input', 'aria-label': 'Show' },
    [['all', 'All hymns'], ['published', 'Published'], ['familiar', 'Familiar'], ['approved', 'Approved (not live)']].map(([v, l]) => h('option', { value: v }, l)));
  const tbody = h('tbody');

  async function publish(hymn) {
    if (!hymn.audio_path) return flash(status, `#${hymn.number} has no audio yet: run the importer for it first.`, 'error');
    let check;
    try { check = pdCheck(await db.hymnAbc(hymn)); } catch (e) { return flash(status, e.message, 'error'); }
    if (!check.ok) return flash(status, `#${hymn.number} can’t be published: not fully public domain per its file (${check.reason}).`, 'error');
    await change(hymn, { status: 'published' }, `Published #${hymn.number} ${hymn.title} (${check.reason}).`);
  }

  async function change(hymn, patch, message) {
    try {
      await db.updateHymn(hymn.id, patch);
      Object.assign(hymn, patch);
      flash(status, message);
      draw();
    } catch (e) { flash(status, e.message, 'error'); }
  }

  function draw() {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = hymns.filter((x) => {
      if (only.value === 'published' && x.status !== 'published') return false;
      if (only.value === 'familiar' && !x.is_familiar) return false;
      if (only.value === 'approved' && x.status !== 'approved') return false;
      const hay = `${x.number} ${x.title} ${x.first_line ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    tbody.replaceChildren(...shown.slice(0, 200).map((x) => h('tr', {},
      h('td', {}, String(x.number)),
      h('td', {}, x.title, h('div', { class: 'small muted' }, x.first_line ?? '')),
      h('td', {}, chip(x.status)),
      h('td', {}, x.audio_path ? 'yes' : h('span', { class: 'muted' }, 'no')),
      h('td', {}, x.timing_verified ? 'yes' : h('span', { class: 'muted' }, 'no')),
      h('td', {}, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: x.is_familiar,
        onchange: (e) => change(x, { is_familiar: e.target.checked }, `#${x.number} ${e.target.checked ? 'marked' : 'unmarked'} familiar.`) }),
      h('span', { class: 'sr-only' }, `Familiar: ${x.title}`))),
      h('td', {}, x.status === 'published'
        ? h('button', { class: 'btn small', type: 'button', onclick: () => change(x, { status: 'approved' }, `Unpublished #${x.number}.`) }, 'Unpublish')
        : h('button', { class: 'btn small primary', type: 'button', onclick: () => publish(x) }, 'Publish')))));
    if (shown.length > 200) tbody.append(h('tr', {}, h('td', { colspan: '7', class: 'muted' }, `Showing 200 of ${shown.length}: search to narrow it down.`)));
  }

  search.addEventListener('input', draw);
  only.addEventListener('change', draw);
  main.append(
    h('div', { class: 'toolbar' }, h('h1', {}, 'Hymns')),
    h('p', { class: 'muted' }, 'Only published hymns can be used in study plans and appear on tablets. Publishing checks that the hymn is ',
      'fully public domain per its Open Hymnal file and has audio. Familiar hymns get audio when the importer runs.'),
    status,
    h('div', { class: 'field-row' }, h('div', { class: 'field' }, search), h('div', { class: 'field' }, only)),
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['No.', 'Title', 'Status', 'Audio', 'Timing', 'Familiar', 'Action'].map((t) => h('th', { scope: 'col' }, t)))),
      tbody));
  draw();
}
