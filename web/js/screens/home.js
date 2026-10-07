// Engage further (#/explore): four big tiles (Read Scripture, Worship, Games, Start a Bible
// Study), Home back to "Chosen for you", and a small Aide tools link in the corner.
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
    // "Chosen for you" replaced My Day; a Bible study comes last (bottom right): it's the
    // longest activity, so it's offered after the quicker ones.
    h('div', { class: 'tiles four' },
      tile('#/read', 'Read Scripture', 'Large print, read aloud', true),
      tile('#/sing', 'Worship', 'Sing a hymn, or pray'),
      tile('#/games', 'Games', 'Word search, crossword, trivia'),
      tile('#/studies', 'Start a Bible Study', 'Choose a study plan'))));
}
