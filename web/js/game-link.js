// game-link.js - "Play a game about this": which passage a study part is about, and the
// address of a game screen for it.
//
//   #/game/<type>?book=PSA&chapter=23&start=1&end=4&difficulty=easy&from=<where to go back>
//   #/game/trivia?hymn=<id>&from=…    (a hymn with no Scripture reference: finish-the-line questions)
import { GAME_TYPES } from './curate.js';

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
export function gameHash(type, { ref = null, hymn_id = null, difficulty = 'easy' } = {}, from = null) {
  const q = new URLSearchParams();
  if (ref) { q.set('book', ref.book); q.set('chapter', ref.chapter); q.set('start', ref.start); q.set('end', ref.end); }
  if (hymn_id) q.set('hymn', hymn_id);
  q.set('difficulty', difficulty);
  if (from) q.set('from', from);
  return `#/game/${type}?${q}`;
}

/** Only our own app's routes may be a "Back to study" target. */
export const safeFrom = (from) => (typeof from === 'string' && /^#\/[\w/?=&.-]*$/.test(from) ? from : null);
