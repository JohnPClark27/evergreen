// Engage further (#/explore): four big tiles (Read Scripture, Worship, Games, Start a Bible
// Study), "My Day" back to My Day, and a small Aide tools link in the corner.
import { setHub } from '../nav.js';
import { brandLogo, h, icon } from '../ui.js';

export async function render(root, _params, ctx) {
  setHub('explore'); // screens opened from here come back with "Back to engage"
  // Each tile unlocks sound inside the tap itself, then opens its screen.
  const open = (hash) => async () => { await ctx.unlock(); ctx.go(hash); };
  const tile = (hash, title, sub, primary = false) => h('button', { class: `tile${primary ? ' primary' : ''}`, type: 'button', onclick: open(hash) },
    h('span', { class: 'tile-title' }, title), h('span', { class: 'tile-sub' }, sub));

  root.append(h('div', { class: 'screen home' },
    h('button', { class: 'pill corner-left', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'My Day')),
    h('a', { class: 'aide-link corner', href: '#/aide' }, 'Aide tools'),
    brandLogo(),
    h('h1', { class: 'welcome', tabindex: '-1' }, 'Engage further'),
    // "Chosen for you" replaced My Day; a Bible study comes last (bottom right): it's the
    // longest activity, so it's offered after the quicker ones.
    h('div', { class: 'tiles four' },
      tile('#/read', 'Read Scripture', 'Large print, read aloud', true),
      tile('#/worship', 'Worship', 'Sing a hymn, or pray'),
      tile('#/games', 'Games', 'Word search, crossword, trivia'),
      tile('#/studies', 'Start a Bible Study', 'Choose a study plan'))));
}
