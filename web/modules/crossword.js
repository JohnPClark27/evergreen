// Crossword module: a small crossword (4–6 words) from a short Bible passage.
//
// Each clue is the verse itself with the word left out (no clues are written by AI or by us).
// Tap a clue, type the word in the big box, and "Put it in"; or "Show a letter" / "Show the
// word" for help. Nothing is scored. The layout is built on the tablet, the same every time
// for the same passage.
import { refLabel } from '../js/books.js';
import { h } from './kit.js';
import { blankOut, gameFrame, gameModule, loadPassage, passageWords, seeded, shuffled } from './game-common.js';

const MAX_WORDS = { easy: 4, normal: 6 };

/**
 * Lay words out crossword-style. words: [{ word, verse }]. Returns
 * { rows, cols, entries: [{ word, verse, row, col, across, num }] } (cropped to its bounding box).
 */
export function layout(words, max, rnd) {
  const cells = new Map(); // "r,c" -> letter
  const at = (r, c) => cells.get(`${r},${c}`);
  const entries = [];
  const fits = (word, r, c, across) => {
    const dr = across ? 0 : 1, dc = across ? 1 : 0;
    if (at(r - dr, c - dc) || at(r + dr * word.length, c + dc * word.length)) return false; // ends must be clear
    let crosses = 0;
    for (let i = 0; i < word.length; i++) {
      const rr = r + dr * i, cc = c + dc * i;
      const cur = at(rr, cc);
      if (cur) { if (cur !== word[i]) return false; crosses++; continue; }
      // An empty square must not touch letters on its sides (that would spell stray words).
      if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) return false;
    }
    return entries.length === 0 || (crosses > 0 && crosses < word.length);
  };
  const place = (w, r, c, across) => {
    for (let i = 0; i < w.word.length; i++) cells.set(`${across ? r : r + i},${across ? c + i : c}`, w.word[i]);
    entries.push({ ...w, row: r, col: c, across });
  };

  const pool = shuffled(words, rnd).sort((a, b) => b.word.length - a.word.length);
  if (!pool.length) return { rows: 0, cols: 0, entries: [] };
  place(pool[0], 0, 0, true);
  for (const w of pool.slice(1)) {
    if (entries.length >= max) break;
    let done = false;
    // Try to cross each placed word at a shared letter, running the other way.
    for (const e of shuffled(entries, rnd)) {
      for (let i = 0; i < e.word.length && !done; i++) {
        for (let j = 0; j < w.word.length && !done; j++) {
          if (e.word[i] !== w.word[j]) continue;
          const across = !e.across;
          const r = e.across ? e.row - j : e.row + i;
          const c = e.across ? e.col + i : e.col - j;
          if (fits(w.word, r, c, across)) { place(w, r, c, across); done = true; }
        }
      }
      if (done) break;
    }
  }
  // Crop and number (numbers go top-to-bottom, left-to-right, like a printed crossword).
  const rs = entries.flatMap((e) => [e.row, e.across ? e.row : e.row + e.word.length - 1]);
  const cs = entries.flatMap((e) => [e.col, e.across ? e.col + e.word.length - 1 : e.col]);
  const r0 = Math.min(...rs), c0 = Math.min(...cs);
  for (const e of entries) { e.row -= r0; e.col -= c0; }
  const starts = [...new Set(entries.map((e) => `${e.row},${e.col}`))]
    .map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const e of entries) e.num = starts.findIndex(([r, c]) => r === e.row && c === e.col) + 1;
  entries.sort((a, b) => (a.across === b.across ? a.num - b.num : a.across ? -1 : 1));
  return { rows: Math.max(...rs) - r0 + 1, cols: Math.max(...cs) - c0 + 1, entries };
}

/** Words from different verses first, so one clue never shows another clue's answer.
 * A short passage (fewer verses than words wanted) may use a second word from a verse. */
function oneWordPerVerse(words, max) {
  const best = new Map(); // verse -> its longest word
  for (const w of words) if (!best.has(w.verse) || w.word.length > best.get(w.verse).word.length) best.set(w.verse, w);
  return best.size >= max ? [...best.values()] : words;
}

export default gameModule('crossword', 'Crossword', '▤',
  'A small crossword; each clue is a line of the passage with one word left out.',
  async (stage, c, kit) => {
    const passage = await loadPassage(stage, c, kit, 'Crossword');
    if (!passage) return { stop() {} };
    const level = c.difficulty === 'normal' ? 'normal' : 'easy';
    const ref = refLabel(c.book, c.chapter, c.start, c.end);
    const verseText = new Map(passage.verses.map((v) => [v.num, v.text]));
    const status = h('p', { class: 'game-status', 'aria-live': 'polite' });
    const gridEl = h('div', { class: 'cw-grid', 'aria-hidden': 'true' }); // the clues and box are the accessible way in
    const clueList = h('ol', { class: 'cw-clues' });
    const box = h('input', { class: 'cw-input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Your word' });
    const putBtn = h('button', { class: 'pill primary', type: 'button' }, 'Put it in');
    const letterBtn = h('button', { class: 'pill', type: 'button' }, 'Show a letter');
    const wordBtn = h('button', { class: 'pill', type: 'button' }, 'Show the word');
    const answerRow = h('div', { class: 'cw-answer' }, h('label', { class: 'cw-label' }), box, putBtn, letterBtn, wordBtn);

    let puzzle, filled, current, shown;

    function draw() {
      puzzle = layout(oneWordPerVerse(passageWords(passage.verses, { min: 3, max: 9 }), MAX_WORDS[level]), MAX_WORDS[level], seeded(`${ref}|${level}|cw`));
      filled = new Map(); // "r,c" -> letter the player has put in (or was shown)
      shown = new Set();  // words already complete
      gridEl.style.gridTemplateColumns = `repeat(${puzzle.cols}, 1fr)`;
      gridEl.style.width = `min(${puzzle.cols * 48}px, 100%)`;
      drawGrid();
      clueList.replaceChildren(...puzzle.entries.map((e, i) => h('li', {},
        h('button', { class: 'cw-clue', type: 'button', 'data-i': String(i), onclick: () => choose(i) },
          h('strong', {}, `${e.num} ${e.across ? 'across' : 'down'} (${e.word.length} letters): `),
          `${blankOut(verseText.get(e.verse) ?? '', e.word)} (v. ${e.verse})`))));
      choose(0);
      status.textContent = puzzle.entries.length >= 2
        ? 'Tap a clue. Each clue is a verse with one word missing.'
        : 'This passage has too few words for a crossword. Try another passage.';
    }

    const cellsOf = (e) => [...e.word].map((_, k) => [e.across ? e.row : e.row + k, e.across ? e.col + k : e.col]);

    function drawGrid() {
      const open = new Map();
      const nums = new Map();
      for (const e of puzzle.entries) {
        cellsOf(e).forEach(([r, c2]) => open.set(`${r},${c2}`, true));
        nums.set(`${e.row},${e.col}`, e.num);
      }
      const mine = current != null ? new Set(cellsOf(puzzle.entries[current]).map(([r, c2]) => `${r},${c2}`)) : new Set();
      const out = [];
      for (let r = 0; r < puzzle.rows; r++) {
        for (let c2 = 0; c2 < puzzle.cols; c2++) {
          const k = `${r},${c2}`;
          out.push(open.has(k)
            ? h('div', { class: `cw-cell${mine.has(k) ? ' now' : ''}` }, nums.has(k) && h('span', { class: 'cw-num' }, String(nums.get(k))), filled.get(k) ?? '')
            : h('div', { class: 'cw-cell block' }));
        }
      }
      gridEl.replaceChildren(...out);
    }

    function choose(i) {
      current = i;
      const e = puzzle.entries[i];
      if (!e) return;
      for (const b of clueList.querySelectorAll('.cw-clue')) b.classList.toggle('now', b.dataset.i === String(i));
      answerRow.querySelector('.cw-label').textContent = `${e.num} ${e.across ? 'across' : 'down'}:`;
      box.value = '';
      box.maxLength = e.word.length;
      drawGrid();
    }

    function fill(e, letters) {
      cellsOf(e).forEach(([r, c2], k) => { if (letters[k]) filled.set(`${r},${c2}`, letters[k]); });
      if (cellsOf(e).every(([r, c2], k) => filled.get(`${r},${c2}`) === e.word[k])) shown.add(e.word);
      drawGrid();
      if (shown.size === puzzle.entries.length) status.textContent = 'The crossword is complete! Thank you for playing.';
    }

    putBtn.addEventListener('click', () => {
      const e = puzzle.entries[current];
      if (!e) return;
      const guess = box.value.trim().toUpperCase();
      if (guess === e.word) {
        fill(e, e.word);
        status.textContent = shown.size === puzzle.entries.length ? status.textContent : `Yes: ${e.word}. Tap another clue.`;
      } else {
        status.textContent = `This one has ${e.word.length} letters. “Show a letter” can help.`;
      }
    });
    box.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') putBtn.click(); });
    letterBtn.addEventListener('click', () => {
      const e = puzzle.entries[current];
      if (!e) return;
      const k = cellsOf(e).findIndex(([r, c2], j) => filled.get(`${r},${c2}`) !== e.word[j]);
      if (k < 0) return;
      const letters = cellsOf(e).map(([r, c2], j) => (j === k ? e.word[j] : filled.get(`${r},${c2}`)));
      fill(e, letters);
      status.textContent = `Letter ${k + 1} is ${e.word[k]}.`;
    });
    wordBtn.addEventListener('click', () => {
      const e = puzzle.entries[current];
      if (!e) return;
      fill(e, e.word);
      if (shown.size < puzzle.entries.length) status.textContent = `The word is ${e.word}.`;
    });

    gameFrame(stage, {
      title: 'Crossword',
      ref: passage.reference,
      attribution: passage.attribution,
      body: h('div', {}, status, h('div', { class: 'cw-wrap' }, gridEl, h('div', { class: 'cw-side' }, answerRow, clueList))),
    });
    draw();
    return { againLabel: 'Start again', again: draw, stop() {} };
  });
