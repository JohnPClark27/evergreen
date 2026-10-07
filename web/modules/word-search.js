// Word Search module: find words from a short Bible passage in a grid of big letters.
// (Phase 1 placeholder: a fixed practice grid.)
import { refLabel } from '../js/books.js';
import { h } from './kit.js';
import { gameFrame, gameModule } from './game-common.js';

export default gameModule('word-search', 'Word Search', '▦',
  'Find words from a short passage in a grid of big letters. Nothing is scored.',
  (stage, c) => {
    const rows = ['GRACEX', 'HOPEAB', 'LIGHTC', 'PEACED', 'JOYEFG', 'LOVEHI'];
    gameFrame(stage, {
      title: 'Word Search',
      ref: refLabel(c.book, c.chapter, c.start, c.end),
      attribution: 'Practice grid (placeholder)',
      body: h('div', { class: 'ws-wrap' },
        h('div', { class: 'ws-grid', style: 'grid-template-columns: repeat(6, 1fr)' },
          rows.flatMap((r) => [...r].map((ch) => h('button', { class: 'ws-cell', type: 'button' }, ch)))),
        h('ul', { class: 'ws-bank' }, ['GRACE', 'HOPE', 'LIGHT', 'PEACE', 'JOY', 'LOVE'].map((w) => h('li', {}, w)))),
    });
    return { stop() {} };
  });
