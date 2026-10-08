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
/** Games still being finished: labelled "Work in progress", and kept out of My Day. */
export const WIP_GAMES = ['word-search', 'crossword'];

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

const CACHE = 'hr.curate'; // sessionStorage: { [context + current]: result }, so navigating back doesn't re-ask

function cached(key) { try { return JSON.parse(sessionStorage.getItem(CACHE))?.[key] ?? null; } catch { return null; } }
function cache(key, value) {
  try {
    const all = JSON.parse(sessionStorage.getItem(CACHE) ?? '{}');
    all[key] = value;
    sessionStorage.setItem(CACHE, JSON.stringify(all));
  } catch { /* fine without a cache */ }
}
export function clearCurateCache() { try { sessionStorage.removeItem(CACHE); } catch { /* fine */ } }

/** The function's answer -> playable items, re-checked against this tablet's catalog. */
function fromServer(res, catalog, context) {
  const has = {
    hymn: new Set(catalog.hymns.map((x) => String(x.id))),
    prayer: new Set(catalog.prayers.map((x) => String(x.id))),
    ref: new Set(catalog.refs.map(refKey)),
  };
  const known = (type, id) => (type === 'hymn' ? has.hymn.has(id) : type === 'prayer' ? has.prayer.has(id)
    : (type === 'scripture' || GAME_TYPES.includes(type)) && has.ref.has(id));
  const suggestions = (res.suggestions ?? [])
    .filter((s) => known(s.module_type, String(s.id_or_ref)))
    .map((s) => ({ module_type: s.module_type, config: configFor(s.module_type, String(s.id_or_ref)), reason: String(s.reason ?? '') }))
    .filter((s) => s.config && !engagement.skipped(s.module_type, s.config));
  const g = res.game;
  const gameRef = g && parseRefKey(g.ref);
  const game = g && GAME_TYPES.includes(g.type) && gameRef
    ? { type: g.type, difficulty: g.difficulty === 'normal' ? 'normal' : 'easy', ref: gameRef, reason: String(g.reason ?? '') } : null;
  if (context === 'my_day' ? !suggestions.length : !game) return null;
  return { suggestions, game, source: res.source === 'ai' ? 'ai' : 'fallback' };
}

/**
 * Get suggestions for a context. Never throws and never waits more than ~5 s: on a slow or
 * failed call it quietly uses the random fallback.
 * current: { ref?: {book, chapter, start, end}, hymn_id? }   fresh: skip the session cache.
 */
export async function curate(context, { current = {}, fresh = false } = {}) {
  let catalog;
  try { catalog = await api.getCatalog(); } catch { return { suggestions: [], game: null, source: 'none' }; }
  const currentRef = current.ref ? refKey(current.ref) : null;
  const key = `${context}|${currentRef ?? ''}|${current.hymn_id ?? ''}`;
  if (!fresh) {
    const hit = cached(key);
    if (hit) return hit;
  }
  let result = null;
  try {
    const res = await api.callCurate({
      action: 'curate',
      context,
      history: engagement.summary(catalog.hymns),
      current: { ref: currentRef ?? undefined, hymn_id: current.hymn_id ?? undefined },
      catalog: { hymns: catalog.hymns.map((x) => x.id), prayers: catalog.prayers.map((x) => x.id), refs: catalog.refs.map(refKey) },
    });
    result = fromServer(res, catalog, context);
  } catch (err) {
    console.info('curate: using the fallback', err.message); // info, not error: this is expected when offline
  }
  result ??= fallback(context, catalog, current);
  if (context === 'slide_game' && result.game && current.ref) result.game.ref = current.ref; // stay on the slide's passage
  cache(key, result);
  return result;
}

/** A suggestion's "what is it about" string for the history (hymn id or ref key). */
export const suggestionId = (s) => idOrRef(s.module_type, s.config);
