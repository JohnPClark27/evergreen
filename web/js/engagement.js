// engagement.js - what this tablet has enjoyed, skipped, opened and played, for AI curation.
//
// Everything stays in localStorage (store.js: hr.itemNotes, hr.activity, plus the older
// hr.hymnNotes from Sing a Hymn). Only a compact summary leaves the tablet, in the curate
// call: item types, hymn ids, Scripture references, prayer ids, 👍/👎 and counts. No names,
// no dates, no free text.
import { store } from './store.js';

/** "PSA.23.1-4" (a reference as a short key; never verse text). */
export const refKey = (c) => `${c.book}.${c.chapter}.${c.start ?? ''}-${c.end ?? c.start ?? ''}`;

/** Parse "PSA.23.1-4" back to { book, chapter, start, end }, or null. */
export function parseRefKey(s) {
  const m = /^([1-3A-Z]{3})\.(\d+)\.(\d*)-(\d*)$/.exec(String(s ?? ''));
  if (!m) return null;
  return { book: m[1], chapter: Number(m[2]), start: m[3] ? Number(m[3]) : null, end: m[4] ? Number(m[4]) : null };
}

const REF_TYPES = new Set(['scripture', 'word-search', 'crossword', 'trivia']);

/** The id or reference an item is about: hymn id, prayer id or "PSA.23.1-4"; null if none. */
export function idOrRef(type, c = {}) {
  if (type === 'hymn' || type === 'finish-line') return c.hymn_id != null ? String(c.hymn_id) : null;
  if (type === 'prayer') return c.prayer_id != null ? String(c.prayer_id) : null;
  if (REF_TYPES.has(type) && c.book) return refKey(c);
  return null;
}

/** A stable key for notes and counts, e.g. "hymn:12" or "trivia:PSA.23.1-4"; null if none. */
export function itemKey(type, c) {
  const id = idOrRef(type, c);
  return id == null ? null : `${type}:${id}`;
}

export const engagement = {
  /** Count an event: 'opened' (a module shown), 'finished' (a study done), 'played' (a game). */
  record(type, config, what) {
    const key = itemKey(type, config);
    if (key) store.countActivity(key, type, what);
  },

  /** 👍 / 👎 for an item: 'enjoyed' | 'skip' | null. Hymns also keep the Sing a Hymn note. */
  note(type, config, kind, hymnNumber = null) {
    const key = itemKey(type, config);
    if (!key) return;
    store.setItemNote(key, kind);
    if (type === 'hymn' && hymnNumber != null) store.setNote(hymnNumber, kind);
  },
  noteFor(type, config) {
    const key = itemKey(type, config);
    return key ? store.itemNotes()[key] : undefined;
  },

  /** Is this item marked "Skip next time"? (never suggested again) */
  skipped(type, config) { return engagement.noteFor(type, config) === 'skip'; },

  /** Nothing recorded yet: a first-time tablet. */
  isNew() {
    return !Object.keys(store.activity()).length && !Object.keys(store.itemNotes()).length
      && !Object.keys(store.notes()).length;
  },

  /**
   * The compact history sent to the curate function (at most 40 entries):
   * [{ type, id_or_ref, thumbs: 'up' | 'down' | null, opened, finished, played }]
   * hymns: the published hymn list, to turn Sing a Hymn's notes (by number) into hymn ids.
   */
  summary(hymns = []) {
    const notes = store.itemNotes();
    const activity = store.activity();
    const out = new Map();
    const thumbs = (n) => (n === 'enjoyed' ? 'up' : n === 'skip' ? 'down' : null);
    const add = (key, type, extra) => {
      const id = key.slice(key.indexOf(':') + 1);
      const row = out.get(key) ?? { type, id_or_ref: id, thumbs: null, opened: 0, finished: 0, played: 0 };
      out.set(key, { ...row, ...extra });
    };
    for (const [key, a] of Object.entries(activity)) {
      add(key, a.type, { opened: a.opened ?? 0, finished: a.finished ?? 0, played: a.played ?? 0 });
    }
    for (const [key, n] of Object.entries(notes)) add(key, key.split(':')[0], { thumbs: thumbs(n) });
    const byNumber = new Map(hymns.map((x) => [String(x.number), x.id]));
    for (const [number, n] of Object.entries(store.notes())) {
      const id = byNumber.get(number);
      if (id != null && !out.has(`hymn:${id}`)) add(`hymn:${id}`, 'hymn', { thumbs: thumbs(n) });
    }
    return [...out.values()].slice(-40);
  },
};
