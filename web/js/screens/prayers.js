// Prayers (#/prayers): the published prayer library as big tiles (Worship's second section).
// #/prayers/<id> reads one, in the same player as a study part (text, source, read-aloud).
import * as api from '../api.js';
import { runStudy } from '../runner.js';
import { h, icon } from '../ui.js';

export async function render(root, params, ctx) {
  if (params.arg) {
    const prayer = await api.getPrayerById(params.arg);
    if (!prayer) { ctx.go('#/prayers'); return null; }
    return runStudy(root, { title: prayer.title, subtitle: 'Prayer', items: [{ module_type: 'prayer', config: { prayer_id: prayer.id } }] }, ctx, {
      exitLabel: 'Prayers', onExit: () => ctx.go('#/prayers'), onFinish: () => ctx.go('#/prayers'),
    });
  }
  const prayers = await api.getPrayers();
  root.append(h('div', { class: 'screen sing' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/sing') }, icon('back'), h('span', { class: 'label' }, 'Hymns')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Prayers'),
      h('p', { class: 'day' }, '')),
    h('div', { class: 'study-grid', tabindex: '0', role: 'region', 'aria-label': 'Prayers' },
      prayers.map((p) => h('button', {
        class: 'study-tile', type: 'button', onclick: async () => { await ctx.unlock(); ctx.go(`#/prayers/${p.id}`); },
      },
      h('span', { class: 'study-tile-title' }, p.title),
      h('span', { class: 'study-tile-meta' }, p.attribution ?? p.source))))));
  return null;
}
