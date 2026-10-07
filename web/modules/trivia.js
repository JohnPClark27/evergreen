// Bible Trivia module: three gentle questions about what a short passage says.
// (Phase 1 placeholder.)
import { refLabel } from '../js/books.js';
import { h } from './kit.js';
import { gameFrame, gameModule } from './game-common.js';

export default gameModule('trivia', 'Bible Trivia', '?',
  'Three gentle questions about what a passage says. The verse is shown after each answer.',
  (stage, c) => {
    let n = 0;
    const draw = () => gameFrame(stage, {
      title: `Bible Trivia · Question ${n + 1} of 3`,
      ref: refLabel(c.book, c.chapter, c.start, c.end),
      attribution: 'Practice questions (placeholder)',
      body: h('div', { class: 'quiz' },
        h('p', { class: 'big-text' }, `Practice question ${n + 1}`),
        h('div', { class: 'quiz-choices' }, ['Answer A', 'Answer B', 'Answer C'].map((a) =>
          h('button', { class: 'quiz-choice', type: 'button', onclick: () => { if (n < 2) { n++; draw(); } } }, a)))),
    });
    draw();
    return { stop() {} };
  });
