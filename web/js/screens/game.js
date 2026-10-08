// One game (#/game/<type>?book=…&chapter=…&start=…&end=…&difficulty=…&from=…).
// The game module draws into the card; the reference and attribution are always shown.
// Opened from a study part, "Back to study" returns to that part.
import * as api from '../api.js';
import { refLabel } from '../books.js';
import { fallback } from '../curate.js';
import { engagement } from '../engagement.js';
import { safeFrom } from '../game-link.js';
import { moduleFor } from '../../modules/index.js';
import { aiMark, h, icon } from '../ui.js';

export async function render(root, params, ctx) {
  const mod = moduleFor(params.arg);
  const from = safeFrom(params.from);
  // Back to where the game was opened: a study part, My Day, or the Games list.
  const fromStudy = from && /^#\/(study|preview)/.test(from);
  const fromMyDay = from && /^#\/(today|\?|$)/.test(from);
  const back = () => ctx.go(from ?? '#/games');
  const backLabel = fromStudy ? 'Back to study' : fromMyDay ? 'My Day' : 'Games';

  let config = { difficulty: params.difficulty === 'normal' ? 'normal' : 'easy' };
  if (params.book) {
    config = { ...config, book: params.book, chapter: Number(params.chapter), start: Number(params.start), end: Number(params.end) };
  } else if (params.hymn) {
    // A hymn: play about the Scripture it's based on, if it names a passage; else its own words.
    const r = (await api.getHymnRefs(Number(params.hymn)).catch(() => [])).find((x) => x.verse_start);
    if (r) config = { ...config, book: r.book, chapter: r.chapter, start: r.verse_start, end: Math.min(r.verse_end ?? r.verse_start, r.verse_start + 11) };
    else config.hymn_id = Number(params.hymn);
  } else {
    const game = fallback('games', await api.getCatalog()).game; // no passage given: a random one
    if (game) config = { ...config, ...game.ref };
  }
  const hymn = config.hymn_id ? await api.getHymnById(config.hymn_id) : null;
  const label = config.book ? refLabel(config.book, config.chapter, config.start, config.end) : hymn?.title ?? '';

  const stage = h('section', { class: 'card', tabindex: '0', 'aria-label': mod?.name ?? 'Game' });
  root.append(h('div', { class: 'screen session game-screen' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: back }, icon('back'), h('span', { class: 'label' }, backLabel)),
      h('h1', { class: 'screen-title', tabindex: '-1' }, mod?.name ?? 'Game'),
      h('p', { class: 'day game-day' }, label, params.src && aiMark(params.src))),
    params.why && ctx.store.settings().showReasons === true && h('p', { class: 'reason' }, `Why this game: ${params.why}`),
    stage,
    fromStudy && h('footer', { class: 'bottombar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/games') }, h('span', { class: 'label' }, 'More games')),
      h('button', { class: 'pill primary big', type: 'button', onclick: back }, icon('back'), h('span', { class: 'label' }, 'Back to study')))));

  if (!mod?.play) {
    stage.replaceChildren(h('p', { class: 'big-text' }, 'That game isn’t available.'));
    return null;
  }
  engagement.record(mod.type, config, 'played');
  const kit = { audio: ctx.audio, speaker: ctx.speaker, api, paused: () => false };
  const controller = await mod.play(stage, config, kit);
  return () => { try { controller?.stop?.(); } catch (err) { console.error(err); } };
}
