// Quiz module: gentle questions, one at a time. Tapping any answer reveals the right one
// ("The answer is …"). There is NO scoring: no right/wrong tally, nothing is saved.
import { field, h, textInput } from './kit.js';

const MAX_QUESTIONS = 10;
const CHOICES = 4;

const usable = (q) => (q.choices ?? []).map((text, i) => ({ text: (text ?? '').trim(), i })).filter((x) => x.text);

export default {
  type: 'quiz',
  name: 'Quiz',
  icon: '?',
  description: 'Gentle questions with big answer buttons. The answer is always shown; nothing is scored.',
  musicBed: true,

  defaults: () => ({ title: '', read_aloud: true, questions: [{ q: '', choices: ['', '', '', ''], answer: 0 }] }),

  validate(c) {
    const qs = c.questions ?? [];
    if (!qs.length) return ['Add at least one question.'];
    if (qs.length > MAX_QUESTIONS) return [`At most ${MAX_QUESTIONS} questions.`];
    const out = [];
    qs.forEach((q, n) => {
      if (!q.q?.trim()) out.push(`Question ${n + 1}: write the question.`);
      if (usable(q).length < 2) out.push(`Question ${n + 1}: give at least two answers.`);
      else if (!q.choices[q.answer]?.trim()) out.push(`Question ${n + 1}: mark which answer is right.`);
    });
    return out;
  },

  summary: (c) => `${c.title?.trim() || 'Quiz'} · ${(c.questions ?? []).length} question${(c.questions ?? []).length === 1 ? '' : 's'}`,

  // get() returns the latest config (c is only the snapshot this form was drawn from).
  editor(c, { set, get }) {
    const qs = () => get().questions ?? [];
    const update = (n, patch) => set({ questions: qs().map((x, i) => (i === n ? { ...x, ...patch } : x)) });
    const group = `quiz-${Math.random().toString(36).slice(2)}`;
    const blocks = (c.questions ?? []).map((q, n) => {
      const choices = Array.from({ length: CHOICES }, (_, i) => h('div', { class: 'choice-edit' },
        h('input', { type: 'radio', name: `${group}-${n}`, checked: q.answer === i, 'aria-label': `Answer ${i + 1} is right`,
          onchange: () => update(n, { answer: i }) }),
        textInput(q.choices?.[i] ?? '', (v) => {
          const next = [...(qs()[n].choices ?? [])];
          next[i] = v;
          update(n, { choices: next });
        }, { maxLength: 100, placeholder: `Answer ${i + 1}${i > 1 ? ' (optional)' : ''}` })));
      return h('fieldset', { class: 'quiz-q' },
        h('legend', {}, `Question ${n + 1}`),
        field('Question', textInput(q.q, (v) => update(n, { q: v }), { maxLength: 200 })),
        h('p', { class: 'field-hint' }, 'Answers (select the right one):'),
        choices,
        (c.questions ?? []).length > 1 && h('button', { class: 'btn small', type: 'button',
          onclick: () => set({ questions: qs().filter((_, i) => i !== n) }, { redraw: true }) }, 'Remove question'));
    });
    const aloud = h('input', { type: 'checkbox', checked: c.read_aloud !== false,
      onchange: (e) => set({ read_aloud: e.target.checked }) });
    return h('div', {},
      field('Heading (optional)', textInput(c.title, (v) => set({ title: v }), { maxLength: 80 })),
      blocks,
      (c.questions ?? []).length < MAX_QUESTIONS && h('button', { class: 'btn', type: 'button',
        onclick: () => set({ questions: [...qs(), { q: '', choices: ['', '', '', ''], answer: 0 }] }, { redraw: true }) },
      '+ Add a question'),
      h('label', { class: 'check' }, aloud, ' Read each question aloud'));
  },

  play(stage, c, kit) {
    const qs = c.questions ?? [];
    let n = 0;

    function show() {
      const q = qs[n];
      const answer = (q.choices[q.answer] ?? '').trim();
      const reveal = h('p', { class: 'quiz-reveal', 'aria-live': 'polite' });
      const buttons = usable(q).map(({ text, i }) => h('button', {
        class: 'quiz-choice', type: 'button',
        onclick: (e) => {
          // Show the answer gently, whichever button was tapped. No marks, no score.
          buttons.forEach((b) => b.classList.remove('picked'));
          e.currentTarget.classList.add('picked');
          buttons.forEach((b) => b.classList.toggle('answer', b.dataset.i === String(q.answer)));
          reveal.textContent = `The answer is: ${answer}`;
          if (c.read_aloud !== false) kit.speaker.speakText(`The answer is: ${answer}`).catch(() => {});
          if (next) next.hidden = false;
        },
        'data-i': String(i),
      }, text));
      const next = n < qs.length - 1
        ? h('button', { class: 'pill primary', type: 'button', hidden: true, onclick: () => { n++; show(); } }, 'Next question')
        : null;
      stage.replaceChildren(h('div', { class: 'quiz' },
        h('p', { class: 'muted' }, `${c.title?.trim() || 'Quiz'} · Question ${n + 1} of ${qs.length}`),
        h('h2', { class: 'title' }, q.q),
        h('div', { class: 'quiz-choices' }, buttons),
        reveal,
        next));
      if (c.read_aloud !== false && !kit.paused()) {
        kit.speaker.speakText([q.q, ...usable(q).map((x) => x.text)].join('\n')).catch(() => {});
      }
    }

    show();
    return {
      againLabel: 'Start again',
      again: () => { n = 0; show(); },
      pause: () => kit.speaker.pause(),
      resume: () => (kit.speaker.state === 'paused' ? kit.speaker.resume() : null),
      stop: () => kit.speaker.stop(),
    };
  },
};
