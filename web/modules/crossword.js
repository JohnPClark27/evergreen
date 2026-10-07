// Crossword module: a small crossword from words in a short Bible passage.
// (Phase 1 placeholder.)
import { refLabel } from '../js/books.js';
import { h } from './kit.js';
import { gameFrame, gameModule } from './game-common.js';

export default gameModule('crossword', 'Crossword', '▤',
  'A small crossword; each clue is a line of the passage with one word left out.',
  (stage, c) => {
    gameFrame(stage, {
      title: 'Crossword',
      ref: refLabel(c.book, c.chapter, c.start, c.end),
      attribution: 'Practice puzzle (placeholder)',
      body: h('p', { class: 'big-text' }, 'A small crossword will appear here.'),
    });
    return { stop() {} };
  });
