// Home (simple mode): "Welcome." and three big tiles, plus a small link for the aide.
import * as api from '../api.js';
import { h } from '../ui.js';

export async function render(root, _params, ctx) {
  // Each tile unlocks sound inside the tap itself, then opens its screen.
  const open = (hash) => async () => { await ctx.unlock(); ctx.go(hash); };

  const todayLabel = h('span', { class: 'tile-sub' }, 'Hymn, Scripture, and prayer');
  root.append(h('div', { class: 'screen home' },
    h('h1', { class: 'welcome', tabindex: '-1' }, 'Welcome.'),
    h('div', { class: 'tiles' },
      h('button', { class: 'tile primary', type: 'button', onclick: open('#/session') },
        h('span', { class: 'tile-title' }, 'Today’s Hymn & Verse'), todayLabel),
      h('button', { class: 'tile', type: 'button', onclick: open('#/sing') },
        h('span', { class: 'tile-title' }, 'Sing a Hymn'),
        h('span', { class: 'tile-sub' }, 'Choose a favorite')),
      h('button', { class: 'tile', type: 'button', onclick: open('#/read') },
        h('span', { class: 'tile-title' }, 'Read the Bible'),
        h('span', { class: 'tile-sub' }, 'Large print, read aloud'))),
    h('a', { class: 'aide-link', href: '#/aide' }, 'Aide tools')));

  // Show which day is next (quietly; no streaks or reminders).
  try {
    const plans = await api.getPlans();
    const p = ctx.store.progress();
    const plan = plans.find((x) => x.id === p.planId) ?? plans[0];
    if (plan?.days.length) {
      const day = Math.min(Math.max(1, p.planId === plan.id ? p.currentDay : 1), plan.days.length);
      todayLabel.textContent = `Day ${day} · Hymn, Scripture, and prayer`;
    }
  } catch { /* the tile still works; the session screen shows any error */ }
}
