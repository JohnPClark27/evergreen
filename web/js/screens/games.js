// Games hub (#/games): "Picked for you" on top, then Word Search, Crossword and Bible Trivia.
// Every game is built on the tablet from a short passage fetched live from YouVersion; the AI
// only picks WHICH passage and game (with a random fallback). Nothing is scored.
import * as api from '../api.js';
import { hubButton } from '../nav.js';
import { refLabel } from '../books.js';
import { curate, fallback, WIP_GAMES } from '../curate.js';
import { gameHash } from '../game-link.js';
import { moduleFor } from '../../modules/index.js';
import { aiMark, h, icon, wipTag } from '../ui.js';

const CARDS = [
  ['word-search', 'Find words from a passage in a grid of big letters.'],
  ['crossword', 'A small crossword; each clue is a line of the passage.'],
  ['trivia', 'Three gentle questions about what a passage says.'],
];

export async function render(root, _params, ctx) {
  const showReasons = ctx.store.settings().showReasons === true;
  const picked = h('button', { class: 'game-tile picked', type: 'button', disabled: true },
    h('span', { class: 'tag added' }, icon('sparkle'), 'Picked for you'),
    h('span', { class: 'calm-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Choosing a game…'));

  const openRandom = (type) => async () => {
    let ref = null;
    try { ref = fallback('games', await api.getCatalog()).game?.ref ?? null; } catch { /* the game screen picks */ }
    ctx.go(gameHash(type, { ref }, '#/games'));
  };

  root.append(h('div', { class: 'screen sing games' },
    h('header', { class: 'topbar' },
      hubButton(ctx),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Games'),
      h('p', { class: 'day' }, 'Nothing is scored')),
    h('div', { class: 'game-grid' },
      picked,
      CARDS.map(([type, sub]) => h('button', { class: 'game-tile', type: 'button', onclick: openRandom(type) },
        h('span', { class: 'game-tile-icon', 'aria-hidden': 'true' }, moduleFor(type).icon),
        h('span', { class: 'game-tile-title' }, moduleFor(type).name, WIP_GAMES.includes(type) && wipTag()),
        h('span', { class: 'game-tile-sub' }, sub))))));

  // Fill "Picked for you" when the suggestion arrives (or the fallback, if the AI is slow).
  const { game: chosen, source } = await curate('games');
  if (!chosen) { picked.remove(); return null; }
  // Suggest only finished games: a work-in-progress pick becomes Bible Trivia on the same passage.
  const game = WIP_GAMES.includes(chosen.type) ? { ...chosen, type: 'trivia' } : chosen;
  const mod = moduleFor(game.type);
  picked.replaceChildren(...[
    h('span', { class: 'picked-head' }, h('span', { class: 'tag added' }, icon('sparkle'), 'Picked for you'), aiMark(source)),
    h('span', { class: 'game-tile-title' }, `${mod.name}: ${refLabel(game.ref.book, game.ref.chapter, game.ref.start, game.ref.end)}`, WIP_GAMES.includes(game.type) && wipTag()),
    showReasons && game.reason && h('span', { class: 'reason' }, `Why: ${game.reason}`),
  ].filter(Boolean));
  picked.disabled = false;
  picked.addEventListener('click', () => ctx.go(gameHash(game.type, { ...game, src: source }, '#/games')));
  return null;
}
