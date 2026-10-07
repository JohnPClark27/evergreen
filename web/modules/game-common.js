// game-common.js - shared parts of the three Scripture games (word-search, crossword, trivia).
// Not a module itself (the registry doesn't list it).
//
// A game's config is a REFERENCE plus a difficulty: { book, chapter, start, end, difficulty }.
// The verse text is fetched live from YouVersion when the game opens and kept in memory only:
// games are built from it on the tablet and never saved.
import { refLabel } from '../js/books.js';
import scripture from './scripture.js';
import { field, h, select } from './kit.js';

export const DIFFICULTY = [{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }];

/** The module fields every game shares (Studio editor, validation, outline summary). */
export function gameModule(type, name, icon, description, play) {
  return {
    type, name, icon, description,
    musicBed: true,
    defaults: () => ({ ...scripture.defaults(), difficulty: 'easy' }),
    validate: (c) => scripture.validate(c),
    summary: (c) => `${refLabel(c.book, c.chapter, c.start, c.end)} · ${c.difficulty === 'normal' ? 'Normal' : 'Easy'}`,
    editor(c, ctx) {
      return h('div', {},
        scripture.editor(c, ctx),
        field('Difficulty', select(DIFFICULTY, c.difficulty ?? 'easy', (v) => ctx.set({ difficulty: v }))));
    },
    play,
  };
}

/** The frame every game draws in: a title, the game, then the reference and attribution. */
export function gameFrame(stage, { title, ref, attribution, body }) {
  stage.replaceChildren(h('div', { class: 'game' },
    h('h2', { class: 'title' }, title),
    body,
    h('p', { class: 'muted small attribution game-ref' },
      h('strong', {}, ref), attribution ? ` · ${attribution}` : '')));
}

/** Fetch the passage for a game config; on failure draw a calm message and return null. */
export async function loadPassage(stage, c, kit, title) {
  const ref = refLabel(c.book, c.chapter, c.start, c.end);
  stage.replaceChildren(h('p', { class: 'big-text muted' }, `Opening ${ref}…`));
  try {
    return await kit.api.getPassage(c.book, c.chapter, c.start, c.end);
  } catch (err) {
    stage.replaceChildren(h('h2', { class: 'title' }, title), h('p', { class: 'big-text muted' },
      `${ref} could not be loaded right now. ${err.message}`));
    return null;
  }
}
