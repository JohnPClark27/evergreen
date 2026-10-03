// Scripture module: a short passage, fetched live from YouVersion and read aloud.
// Only the REFERENCE is saved (the database refuses anything else for this module).
import { BOOKS, refLabel } from '../js/books.js';
import { field, h, numberInput, readAloud, select } from './kit.js';

const MAX_VERSES = 12; // sessions are short and gentle
const RATE_LABEL = { slower: 'Slower', slow: 'Slow', normal: 'Normal' };

export default {
  type: 'scripture',
  name: 'Scripture',
  icon: '✚',
  description: 'A short Bible passage, shown in large print and read aloud.',
  musicBed: true, // a hymn just sung can keep playing softly underneath

  defaults: () => ({ book: 'PSA', chapter: 23, start: 1, end: 4 }),

  validate(c) {
    const book = BOOKS.find((b) => b[0] === c.book);
    if (!book) return ['Choose a book.'];
    if (!Number.isInteger(c.chapter) || c.chapter < 1 || c.chapter > book[2]) return [`${book[1]} has chapters 1–${book[2]}.`];
    if (!Number.isInteger(c.start) || c.start < 1) return ['Choose the first verse.'];
    if (!Number.isInteger(c.end) || c.end < c.start) return ['The last verse must come after the first.'];
    if (c.end - c.start + 1 > MAX_VERSES) return [`Keep it short: at most ${MAX_VERSES} verses.`];
    return [];
  },

  summary: (c) => refLabel(c.book, c.chapter, c.start, c.end),

  editor(c, { set }) {
    const to = (k) => (v) => set({ [k]: v });
    return h('div', { class: 'field-row' },
      field('Book', select(BOOKS.map(([code, name]) => ({ value: code, label: name })), c.book, to('book'))),
      field('Chapter', numberInput(c.chapter, to('chapter'), { min: 1, max: 150 })),
      field('From verse', numberInput(c.start, to('start'), { min: 1, max: 176 })),
      field('To verse', numberInput(c.end, to('end'), { min: 1, max: 176 })));
  },

  async play(stage, c, kit) {
    const ref = refLabel(c.book, c.chapter, c.start, c.end);
    stage.replaceChildren(h('p', { class: 'big-text muted' }, `Opening ${ref}…`));
    let passage;
    try {
      passage = await kit.api.getPassage(c.book, c.chapter, c.start, c.end);
    } catch (err) {
      stage.replaceChildren(h('h2', { class: 'title' }, ref), h('p', { class: 'muted' }, `The Scripture could not be loaded. ${err.message}`));
      return { stop() {} };
    }
    return readAloud(stage, kit, {
      title: passage.reference,
      badge: `Reading aloud · ${RATE_LABEL[kit.speaker.rateName] ?? 'Slow'}`,
      lines: passage.verses,
      footer: passage.attribution, // always shown with Scripture
    });
  },
};
