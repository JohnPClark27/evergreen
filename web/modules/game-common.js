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

// ---------------------------------------------------------------------------
// Words and randomness (deterministic: the same passage gives the same game)
// ---------------------------------------------------------------------------

/** A small random generator seeded by a string (mulberry32 over a string hash). */
export function seeded(text) {
  let a = 2166136261;
  for (const ch of String(text)) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const shuffled = (list, rnd) => list.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

// Common words (and old-English ones the ASV uses) that make poor puzzle words.
const STOP = new Set(`a about above after again all also am an and any are as at be because been before being
both but by came can come could did do does doing done down each even ever every for from had has have he her
here hers him his how i if in into is it its just let like made make many may me more most much must my no nor
not now of off on once one only or other our ours out over said same say says see shall she should so some such
than that the their theirs them then there these they this those through thus to too unto up upon us very was
we were what when where which while who whom whose why will with would ye yea yet you your yours thee thou thy
thine hath doth art shalt wilt hast didst saith neither either also into thereof therein wherefore whither
behold verily lest nay among against within without because whereby been went goes going get got`.split(/\s+/));

/** Meaningful words of a passage: letters only, upper case, 3+ letters, no common words, unique. */
export function passageWords(verses, { min = 3, max = 8 } = {}) {
  const seen = new Set();
  const out = [];
  for (const v of verses) {
    for (const raw of v.text.split(/[^A-Za-z']+/)) {
      const w = raw.replace(/'s$/i, '').replace(/'/g, '');
      const up = w.toUpperCase();
      if (w.length < min || w.length > max || STOP.has(w.toLowerCase()) || seen.has(up)) continue;
      seen.add(up);
      out.push({ word: up, verse: v.num });
    }
  }
  return out;
}

/** The verse with one word blanked out (the crossword clue / fill-in question). */
export function blankOut(text, word) {
  const re = new RegExp(`\\b${word}\\b`, 'i');
  return text.replace(re, '_'.repeat(Math.min(word.length, 8)));
}

// ---------------------------------------------------------------------------
// Trivia answers must come from the passage (the server checks; the tablet checks again)
// ---------------------------------------------------------------------------

const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const contains = (text, part) => ` ${norm(text)} `.includes(` ${norm(part)} `);

/** Keep a question only if its answer is word for word in its verse and is among 2–4 distinct
 * choices, and no other choice is in that verse. Same rule as the curate function. */
export function checkQuestions(questions, verses) {
  const out = [];
  for (const r of Array.isArray(questions) ? questions : []) {
    const q = String(r?.q ?? '').trim().slice(0, 160);
    const answer = String(r?.answer ?? '').trim().slice(0, 60);
    if (!q || norm(answer).length < 2) continue;
    const choices = [...new Map((Array.isArray(r?.choices) ? r.choices : []).map((c) => String(c ?? '').trim()).filter(Boolean)
      .map((c) => [norm(c), c])).values()].slice(0, 4);
    if (choices.length < 2 || !choices.some((c) => norm(c) === norm(answer))) continue;
    const verse = verses.find((v) => v.num === Number(r?.verse) && contains(v.text, answer)) ?? verses.find((v) => contains(v.text, answer));
    if (!verse) continue;
    if (choices.some((c) => norm(c) !== norm(answer) && contains(verse.text, c))) continue;
    out.push({ q, answer, choices, verse: verse.num });
    if (out.length >= 3) break;
  }
  return out;
}

/** The verse a game step refers to, as a quiet card under the question or puzzle. */
export function verseCard(reference, verse) {
  return h('blockquote', { class: 'verse-card' },
    h('p', { class: 'read-line' }, h('sup', { class: 'vnum' }, String(verse.num)), ' ', verse.text),
    h('p', { class: 'muted small' }, reference));
}
