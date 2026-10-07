// Home (simple mode): "Welcome." and four big tiles (My Day, Read Scripture, Worship, Games),
// plus a small Aide tools link in the corner.
import { h, icon } from '../ui.js';

export async function render(root, _params, ctx) {
  // Each tile unlocks sound inside the tap itself, then opens its screen.
  const open = (hash) => async () => { await ctx.unlock(); ctx.go(hash); };
  const tile = (hash, title, sub, primary = false) => h('button', { class: `tile${primary ? ' primary' : ''}`, type: 'button', onclick: open(hash) },
    h('span', { class: 'tile-title' }, title), h('span', { class: 'tile-sub' }, sub));

  root.append(h('div', { class: 'screen home' },
    h('button', { class: 'pill corner-left', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
    h('a', { class: 'aide-link corner', href: '#/aide' }, 'Aide tools'),
    h('h1', { class: 'welcome', tabindex: '-1' }, 'Engage further'),
    h('div', { class: 'tiles four' },
      tile('#/myday', 'My Day', 'Today’s study, with a little extra for you', true),
      tile('#/read', 'Read Scripture', 'Large print, read aloud'),
      tile('#/sing', 'Worship', 'Sing a hymn, or pray'),
      tile('#/games', 'Games', 'Word search, crossword, trivia'))));
}
