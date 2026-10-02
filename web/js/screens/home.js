// Home (simple mode): "Welcome." and three big tiles, plus a small link for the aide.
import * as api from '../api.js';
import { h } from '../ui.js';

export async function render(root, _params, ctx) {
  // Each tile unlocks sound inside the tap itself, then opens its screen.
  const open = (hash) => async () => { await ctx.unlock(); ctx.go(hash); };

  const studyLabel = h('span', { class: 'tile-sub' }, 'Hymns, Scripture, and prayer');
  root.append(h('div', { class: 'screen home' },
    h('h1', { class: 'welcome', tabindex: '-1' }, 'Welcome.'),
    h('div', { class: 'tiles' },
      h('button', { class: 'tile primary', type: 'button', onclick: open('#/studies') },
        h('span', { class: 'tile-title' }, 'Choose a Study'), studyLabel),
      h('button', { class: 'tile', type: 'button', onclick: open('#/sing') },
        h('span', { class: 'tile-title' }, 'Sing a Hymn'),
        h('span', { class: 'tile-sub' }, 'Choose a favorite')),
      h('button', { class: 'tile', type: 'button', onclick: open('#/read') },
        h('span', { class: 'tile-title' }, 'Read the Bible'),
        h('span', { class: 'tile-sub' }, 'Large print, read aloud'))),
    h('a', { class: 'aide-link', href: '#/aide' }, 'Aide tools')));

  // How many studies are ready (quietly; no streaks or reminders).
  try {
    const n = (await api.getStudyPlans()).length;
    if (n) studyLabel.textContent = `${n} studies ready · hymns, Scripture, and prayer`;
  } catch { /* the tile still works; the list screen shows any error */ }
}
