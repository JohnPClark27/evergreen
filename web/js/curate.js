// curate.js - "Added for you" suggestions and "Picked for you" games.
//
// The AI only SELECTS and ARRANGES published content: hymn ids, prayer ids and Scripture
// references from the catalog (api.getCatalog). It never writes Scripture, prayers or
// theology. Every call has a deterministic fallback (a random pick from the same catalog),
// so the app never breaks or hangs when the AI is slow or down.
//
//   curate(context, { current })  context: 'my_day' | 'games' | 'slide_game'
//   -> { suggestions: [{ module_type, config, reason }], game: { type, difficulty, ref, reason }, source }
import * as api from './api.js';
import { engagement, idOrRef, parseRefKey, refKey } from './engagement.js';

export const GAME_TYPES = ['word-search', 'crossword', 'trivia'];
export const NEW_REASON = 'Trying something new';

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

/** The config a suggestion plays with (a module's saved config shape). */
export function configFor(type, idOrRefValue, difficulty = 'easy') {
  if (type === 'hymn') return { hymn_id: Number(idOrRefValue), sheet: false };
  if (type === 'prayer') return { prayer_id: Number(idOrRefValue) };
  const ref = typeof idOrRefValue === 'string' ? parseRefKey(idOrRefValue) : idOrRefValue;
  if (!ref) return null;
  return GAME_TYPES.includes(type) ? { ...ref, difficulty } : ref;
}

/**
 * The fallback: random, published, never something marked "Skip next time".
 * Cold start and fallback both give one hymn, one Scripture, one prayer, and a game.
 */
export function fallback(context, catalog, current = {}, reason = NEW_REASON) {
  const ok = (type, id) => !engagement.skipped(type, configFor(type, id));
  const hymn = pick(catalog.hymns.filter((x) => ok('hymn', x.id)));
  const prayer = pick(catalog.prayers.filter((x) => ok('prayer', x.id)));
  const ref = pick(catalog.refs.filter((r) => ok('scripture', refKey(r))));
  const gameRef = current.ref ?? ref;
  const gameType = pick(GAME_TYPES.filter((t) => !gameRef || ok(t, refKey(gameRef))));
  const suggestions = [];
  if (context === 'my_day') {
    if (hymn) suggestions.push({ module_type: 'hymn', config: configFor('hymn', hymn.id), reason });
    if (ref) suggestions.push({ module_type: 'scripture', config: configFor('scripture', ref), reason });
    if (prayer) suggestions.push({ module_type: 'prayer', config: configFor('prayer', prayer.id), reason });
  }
  const game = gameRef && gameType ? { type: gameType, difficulty: 'easy', ref: gameRef, reason } : null;
  if (context === 'my_day' && game) suggestions.push({ module_type: game.type, config: configFor(game.type, game.ref), reason });
  // A first-time tablet gets one of each; after that, two at random.
  const shown = engagement.isNew() ? suggestions : shuffle(suggestions).slice(0, 2);
  return { suggestions: shown, game, source: 'fallback' };
}

/** Get suggestions for a context. Never throws; falls back quietly. */
export async function curate(context, { current = {} } = {}) {
  let catalog;
  try { catalog = await api.getCatalog(); } catch { return { suggestions: [], game: null, source: 'none' }; }
  return fallback(context, catalog, current);
}

/** A suggestion's "what is it about" string for the history (hymn id or ref key). */
export const suggestionId = (s) => idOrRef(s.module_type, s.config);
