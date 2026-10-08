// Word Search module: find words from a short Bible passage in a grid of big letters.
//
//   Easy:   6×6, words go across or down only.     Normal: 8×8, also diagonally (down-right).
//   Tap the first letter of a word, then its last letter. The word bank is always visible.
//   "Show me a word" lights up the first letter of one still to find. Nothing is scored.
// The grid is built on the tablet from the passage (fetched live, kept in memory only); the
// same passage always gives the same grid.
import { refLabel } from '../js/books.js';
import { h } from './kit.js';
import { gameFrame, gameModule, loadPassage, passageBlock, passageWords, seeded, shuffled } from './game-common.js';

const LEVELS = {
  easy: { size: 6, words: 5, dirs: [[0, 1], [1, 0]] },
  normal: { size: 8, words: 7, dirs: [[0, 1], [1, 0], [1, 1]] },
};
const FILL = 'AAEEEIIOOUURRSSTTLLNNDDHHMGPBCWY'; // filler letters, weighted toward common ones

/** Place words in a size×size grid. Returns { grid: [[letter]], placed: [{ word, cells: [[r,c]] }] }. */
export function buildGrid(candidates, level, rnd) {
  const { size, words, dirs } = LEVELS[level] ?? LEVELS.easy;
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const placed = [];
  // Longer words first: they're hardest to fit.
  const pool = shuffled(candidates.filter((w) => w.length <= size), rnd).sort((a, b) => b.length - a.length);
  for (const word of pool) {
    if (placed.length >= words) break;
    let done = false;
    for (let tries = 0; tries < 80 && !done; tries++) {
      const [dr, dc] = dirs[Math.floor(rnd() * dirs.length)];
      const r0 = Math.floor(rnd() * (size - dr * (word.length - 1)));
      const c0 = Math.floor(rnd() * (size - dc * (word.length - 1)));
      const cells = [...word].map((_, i) => [r0 + dr * i, c0 + dc * i]);
      if (cells.every(([r, c], i) => grid[r][c] === '' || grid[r][c] === word[i])) {
        cells.forEach(([r, c], i) => { grid[r][c] = word[i]; });
        placed.push({ word, cells });
        done = true;
      }
    }
  }
  for (const row of grid) for (let c = 0; c < size; c++) if (!row[c]) row[c] = FILL[Math.floor(rnd() * FILL.length)];
  return { grid, placed };
}

/** The straight line of cells from a to b (across, down or diagonal), or null. */
function line([r1, c1], [r2, c2]) {
  const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
  const n = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  if (!(r1 === r2 || c1 === c2 || Math.abs(r2 - r1) === Math.abs(c2 - c1))) return null;
  return Array.from({ length: n + 1 }, (_, i) => [r1 + dr * i, c1 + dc * i]);
}

export default gameModule('word-search', 'Word Search', '▦',
  'Find words from a short passage in a grid of big letters. Nothing is scored.',
  async (stage, c, kit) => {
    const passage = await loadPassage(stage, c, kit, 'Word Search');
    if (!passage) return { stop() {} };
    const level = c.difficulty === 'normal' ? 'normal' : 'easy';
    const ref = refLabel(c.book, c.chapter, c.start, c.end);
    const words = passageWords(passage.verses, { min: 3, max: LEVELS[level].size }).map((x) => x.word);
    let built;

    const status = h('p', { class: 'game-status', 'aria-live': 'polite' });
    const gridEl = h('div', { class: 'ws-grid', role: 'group', 'aria-label': 'Letter grid' });
    const bank = h('ul', { class: 'ws-bank', 'aria-label': 'Words to find' });
    const passageEl = passageBlock(passage.verses, kit.speaker, { hidden: true });
    const helpBtn = h('button', { class: 'pill', type: 'button' }, 'Show me a word');
    const passageBtn = h('button', { class: 'pill', type: 'button', 'aria-expanded': 'false' }, 'Show the passage');

    let cells = [], found = new Set(), first = null;

    function draw() {
      built = buildGrid(words, level, seeded(`${ref}|${level}`));
      found = new Set(); first = null;
      const size = built.grid.length;
      gridEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
      cells = built.grid.map((row, r) => row.map((letter, col) => h('button', {
        class: 'ws-cell', type: 'button', 'aria-label': `Row ${r + 1}, column ${col + 1}: ${letter}`,
        onclick: () => tap(r, col),
      }, letter)));
      gridEl.replaceChildren(...cells.flat());
      drawBank();
      status.textContent = built.placed.length
        ? 'Tap the first letter of a word, then its last letter.'
        : 'This passage has too few words for a grid. Try another passage.';
    }

    function drawBank() {
      bank.replaceChildren(...built.placed.map(({ word }) => h('li', { class: found.has(word) ? 'found' : '' },
        found.has(word) ? '✓ ' : '', word)));
    }

    function tap(r, col) {
      if (!first) {
        first = [r, col];
        cells[r][col].classList.add('picked');
        status.textContent = `Now tap the last letter of the word that starts with ${built.grid[r][col]}.`;
        return;
      }
      const start = first;
      cells[start[0]][start[1]].classList.remove('picked');
      first = null;
      const path = line(start, [r, col]);
      const spelled = path?.map(([a, b]) => built.grid[a][b]).join('') ?? '';
      const hit = built.placed.find((p) => !found.has(p.word) && (p.word === spelled || p.word === [...spelled].reverse().join('')));
      if (!hit) {
        status.textContent = 'That isn’t one of the words. Try another first letter.';
        return;
      }
      found.add(hit.word);
      for (const [a, b] of hit.cells) cells[a][b].classList.add('found');
      drawBank();
      if (found.size === built.placed.length) {
        status.textContent = 'You found every word! Here is the passage they came from.';
        passageEl.hidden = false;
        passageBtn.setAttribute('aria-expanded', 'true');
      } else {
        status.textContent = `You found ${hit.word}.`;
      }
    }

    helpBtn.addEventListener('click', () => {
      const next = built.placed.find((p) => !found.has(p.word));
      if (!next) return;
      const [r, col] = next.cells[0];
      cells[r][col].classList.add('hint');
      status.textContent = `${next.word} starts at the letter that is lit up.`;
    });
    passageBtn.addEventListener('click', () => {
      passageEl.hidden = !passageEl.hidden;
      passageBtn.setAttribute('aria-expanded', String(!passageEl.hidden));
    });

    gameFrame(stage, {
      title: 'Word Search',
      ref: passage.reference,
      attribution: passage.attribution,
      body: h('div', {},
        status,
        h('div', { class: 'ws-wrap' }, gridEl, h('div', { class: 'ws-side' }, h('p', { class: 'ws-bank-title' }, 'Find these words:'), bank)),
        h('div', { class: 'row' }, helpBtn, passageBtn),
        passageEl),
    });
    draw();
    return { againLabel: 'Start again', again: draw, stop: () => kit.speaker.stop() };
  });
