// game-link.js - "Play a game about this": which passage a study part is about, and the
// address of a game screen for it.
//
//   #/game/<type>?book=PSA&chapter=23&start=1&end=4&difficulty=easy&from=<where to go back>
//   #/game/trivia?hymn=<id>&from=…    (a hymn with no Scripture reference: finish-the-line questions)
import * as api from './api.js';
import { curate, GAME_TYPES } from './curate.js';

const REF_TYPES = new Set(['scripture', ...GAME_TYPES]);

/** What a part is about: { ref } for Scripture, { hymn_id } for a hymn, else the nearest
 * Scripture part in the same study ({} if there is none). */
export function gameTarget(item, items = []) {
  const c = item?.config ?? {};
  if (REF_TYPES.has(item?.module_type) && c.book) return { ref: refOf(c) };
  if ((item?.module_type === 'hymn' || item?.module_type === 'finish-line') && c.hymn_id) return { hymn_id: c.hymn_id };
  const at = Math.max(0, items.indexOf(item));
  const near = items
    .map((x, i) => ({ x, d: Math.abs(i - at) }))
    .filter(({ x }) => x.module_type === 'scripture' && x.config?.book)
    .sort((a, b) => a.d - b.d)[0];
  return near ? { ref: refOf(near.x.config) } : {};
}

const refOf = (c) => ({ book: c.book, chapter: c.chapter, start: c.start, end: c.end });

/** The hash for a game screen. `from` is where "Back to study" returns (a "#/…" hash). */
export function gameHash(type, { ref = null, hymn_id = null, difficulty = 'easy', why = null, src = null } = {}, from = null) {
  const q = new URLSearchParams();
  if (ref) { q.set('book', ref.book); q.set('chapter', ref.chapter); q.set('start', ref.start); q.set('end', ref.end); }
  if (hymn_id) q.set('hymn', hymn_id);
  q.set('difficulty', difficulty);
  if (src) q.set('src', src === 'ai' ? 'ai' : 'skip'); // who chose the game: shown as a small badge
  if (why) q.set('why', String(why).slice(0, 160)); // shown only with "Show AI reasoning"
  if (from) q.set('from', from);
  return `#/game/${type}?${q}`;
}

/** Only our own app's routes may be a "Back to study" target. */
export const safeFrom = (from) => (typeof from === 'string' && /^#\/[\w/?=&.-]*$/.test(from) ? from : null);

/**
 * "Play a game about this": ask curate which game suits this part (the passage stays the
 * part's own), then open it. A hymn plays about the Scripture it is based on, or, with no
 * reference, "finish the line" from its own words. Never waits more than ~5 s (fallback).
 * button: the tapped control, shown as busy meanwhile.
 */
export async function openGameFor(ctx, item, items, from, button = null) {
  const label = button?.querySelector('.label');
  const before = label?.textContent;
  if (button) { button.disabled = true; if (label) label.textContent = 'Choosing a game…'; }
  try {
    let target = gameTarget(item, items);
    if (!target.ref && target.hymn_id) {
      const r = (await api.getHymnRefs(target.hymn_id).catch(() => [])).find((x) => x.verse_start);
      if (r) target = { ref: { book: r.book, chapter: r.chapter, start: r.verse_start, end: Math.min(r.verse_end ?? r.verse_start, r.verse_start + 11) } };
    }
    if (!target.ref) {
      // No passage at all: finish-the-line questions from the hymn, or a random game.
      ctx.go(target.hymn_id ? gameHash('trivia', target, from) : '#/games');
      return;
    }
    const { game, source } = await curate('slide_game', { current: { ref: target.ref, hymn_id: target.hymn_id } });
    const type = GAME_TYPES.includes(game?.type) ? game.type : 'trivia';
    ctx.go(gameHash(type, { ref: target.ref, difficulty: game?.difficulty ?? 'easy', why: game?.reason, src: source }, from));
  } finally {
    if (button?.isConnected) { button.disabled = false; if (label) label.textContent = before; }
  }
}
