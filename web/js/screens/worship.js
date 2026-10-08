// Worship (#/worship, from Engage further): two big choices, Sing a Hymn or Pray.
// The hymn and prayer lists each go back to the hub (they don't link to each other).
import { hubButton } from '../nav.js';
import { h } from '../ui.js';

export async function render(root, _params, ctx) {
  const tile = (hash, title, sub) => h('button', { class: 'tile', type: 'button', onclick: async () => { await ctx.unlock(); ctx.go(hash); } },
    h('span', { class: 'tile-title' }, title), h('span', { class: 'tile-sub' }, sub));
  root.append(h('div', { class: 'screen worship' },
    h('header', { class: 'topbar' },
      hubButton(ctx),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Worship'),
      h('p', { class: 'day' }, '')),
    h('div', { class: 'tiles two' },
      tile('#/sing', 'Sing a Hymn', 'Choose a favorite'),
      tile('#/prayers', 'Pray', 'Prayers from the library'))));
}
