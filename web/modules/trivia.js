// Bible Trivia module: three gentle questions about what a short passage SAYS.
//
//   1. The curate function writes questions from the verse text sent to it. Each answer must
//      appear word for word in its verse; the function checks, and this file checks again
//      (checkQuestions), dropping any question that fails.
//   2. If fewer than 2 survive (or the AI is slow or down), questions are built here instead:
//      "Fill in the missing word" from the verses themselves.
//   3. A hymn with no Scripture reference (config.hymn_id): "Finish the line" from its words.
// Tapping any answer shows the right one and the verse it comes from. No score, no "wrong".
import { refLabel } from '../js/books.js';
import { aiMark, h } from '../js/ui.js';
import {
  blankOut, checkQuestions, gameFrame, gameModule, loadPassage, passageWords, seeded, shuffled, passageBlock, verseCard,
} from './game-common.js';

/** Fill-in-the-blank questions from the passage (no AI): one per verse, up to 3. */
export function blankQuestions(verses, ref) {
  const rnd = seeded(`${ref}|blank`);
  const words = passageWords(verses, { min: 4, max: 12 });
  const out = [];
  for (const v of shuffled(verses, rnd)) {
    const mine = words.filter((w) => w.verse === v.num);
    if (!mine.length) continue;
    const pick = mine.sort((a, b) => b.word.length - a.word.length)[0];
    const others = shuffled(words.filter((w) => !new RegExp(`\\b${w.word}\\b`, 'i').test(v.text)), rnd).slice(0, 2);
    if (others.length < 2) continue;
    const answer = v.text.match(new RegExp(`\\b${pick.word}\\b`, 'i'))[0];
    out.push({
      q: `Fill in the missing word: “${blankOut(v.text, pick.word)}”`,
      answer,
      choices: shuffled([answer, ...others.map((o) => o.word.charAt(0) + o.word.slice(1).toLowerCase())], rnd),
      verse: v.num,
    });
    if (out.length >= 3) break;
  }
  return out.sort((a, b) => a.verse - b.verse);
}

/** Finish-the-line questions from a hymn's words (timing file), for hymns with no reference. */
async function hymnQuestions(kit, hymnId) {
  const hymn = await kit.api.getHymnById(hymnId);
  const timing = hymn && await kit.api.getTiming(hymn).catch(() => null);
  if (!timing) return null;
  const lines = (timing.stanzas ?? []).filter((s) => s.repeatOf == null)
    .flatMap((s) => s.lines.map((l) => l.map((w) => w.text).join(' ').replace(/\s+([,.;:!?])/g, '$1').trim()))
    .filter((l) => l.split(' ').length >= 4);
  const rnd = seeded(`hymn|${hymnId}`);
  const lastWord = (l) => l.split(' ').at(-1).replace(/[^A-Za-z']/g, '');
  const enders = [...new Set(lines.map(lastWord).filter((w) => w.length > 2))];
  const questions = shuffled(lines, rnd).slice(0, 3).map((l) => {
    const answer = lastWord(l);
    const others = shuffled(enders.filter((w) => w.toLowerCase() !== answer.toLowerCase()), rnd).slice(0, 2);
    return { q: `Finish the line: “${l.slice(0, l.lastIndexOf(' '))} …”`, answer, choices: shuffled([answer, ...others], rnd), line: l };
  }).filter((q) => q.choices.length >= 2);
  return { title: hymn.title, questions };
}

export default gameModule('trivia', 'Bible Trivia', '?',
  'Three gentle questions about what a passage says. The verse is shown after each answer.',
  async (stage, c, kit) => {
    let source, questions, reference, attribution, verses = [];

    if (!c.book && c.hymn_id) {
      stage.replaceChildren(h('p', { class: 'big-text muted' }, 'Getting the hymn’s words…'));
      const hq = await hymnQuestions(kit, c.hymn_id);
      if (!hq?.questions.length) {
        stage.replaceChildren(h('p', { class: 'big-text' }, 'This hymn’s words aren’t available for a game right now.'));
        return { stop() {} };
      }
      ({ questions } = hq);
      reference = hq.title;
      attribution = 'Words from the hymn';
      source = 'hymn';
    } else {
      const passage = await loadPassage(stage, c, kit, 'Bible Trivia');
      if (!passage) return { stop() {} };
      ({ verses, attribution } = passage);
      reference = passage.reference;
      stage.replaceChildren(h('div', { class: 'calm-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Getting questions ready…'));
      let ai = [];
      try {
        const res = await kit.api.callCurate({ action: 'trivia', reference, verses }, 5000);
        ai = checkQuestions(res?.questions, verses); // checked again here: answers must be in the text
      } catch { /* the questions below are built from the passage itself */ }
      questions = ai.length >= 2 ? ai : blankQuestions(verses, refLabel(c.book, c.chapter, c.start, c.end));
      source = ai.length >= 2 ? 'ai' : 'blank';
      if (!questions.length) {
        stage.replaceChildren(h('p', { class: 'big-text' }, 'This passage is too short for questions. Try another one.'));
        return { stop() {} };
      }
    }

    let n = 0;
    function show() {
      const q = questions[n];
      const reveal = h('div', { class: 'quiz-reveal', 'aria-live': 'polite' });
      const next = h('button', { class: 'pill primary big', type: 'button', hidden: true,
        onclick: () => { if (n < questions.length - 1) { n++; show(); } else end(); } },
      n < questions.length - 1 ? 'Next question' : 'All done');
      const buttons = q.choices.map((text) => h('button', {
        class: 'quiz-choice', type: 'button',
        onclick: (e) => {
          // Show the answer gently, whichever was tapped, and the verse it comes from.
          buttons.forEach((b) => { b.classList.remove('picked'); b.classList.toggle('answer', b.textContent === q.answer); });
          e.currentTarget.classList.add('picked');
          const verse = verses.find((v) => v.num === q.verse);
          reveal.replaceChildren(
            h('p', {}, `The answer is: ${q.answer}`),
            verse ? verseCard(`${reference.replace(/:.*$/, '')}:${verse.num}`, verse, kit.speaker)
              : q.line && h('blockquote', { class: 'verse-card' }, h('p', { class: 'read-line' }, q.line)));
          next.hidden = false;
        },
      }, text));
      gameFrame(stage, {
        title: `Bible Trivia · Question ${n + 1} of ${questions.length}`,
        ref: reference,
        attribution,
        body: h('div', { class: 'quiz', 'data-source': source },
          // Were these questions written by Gloo AI (checked word for word) or built on the tablet?
          source !== 'hymn' && h('p', { class: 'trivia-source' }, aiMark(source),
            source === 'ai' ? 'Questions by Gloo AI, checked against the passage' : 'Fill-in-the-blank from the passage'),
          h('p', { class: 'trivia-q' }, q.q),
          h('div', { class: 'quiz-choices' }, buttons),
          reveal,
          next),
      });
    }
    function end() {
      gameFrame(stage, {
        title: 'Bible Trivia',
        ref: reference,
        attribution,
        body: h('div', { class: 'quiz' },
          h('p', { class: 'big-text' }, 'That’s all the questions. Thank you for playing!'),
          verses.length > 0 && passageBlock(verses, kit.speaker),
          h('button', { class: 'pill', type: 'button', onclick: () => { n = 0; show(); } }, 'Play again')),
      });
    }
    show();
    return { againLabel: 'Start again', again: () => { n = 0; show(); }, stop: () => kit.speaker.stop() };
  });
