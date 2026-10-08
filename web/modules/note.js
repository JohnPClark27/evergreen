// Note module: the author's own words (a welcome, a memory to share, a reflection),
// shown in large print and, if chosen, read aloud.
import { field, h, readAloud, textArea, textInput } from './kit.js';

export default {
  type: 'note',
  name: 'Note',
  icon: '✎',
  description: 'Your own words, shown in large print and read aloud if you like.',
  musicBed: true,

  defaults: () => ({ title: '', text: '', read_aloud: true }),

  validate(c) {
    if (!c.text?.trim()) return ['Write the note.'];
    if (c.text.length > 2000) return ['Keep the note under 2,000 characters.'];
    return [];
  },

  summary: (c) => c.title?.trim() || (c.text?.trim() ? `${c.text.trim().slice(0, 50)}${c.text.trim().length > 50 ? '…' : ''}` : 'Empty note'),

  editor(c, { set }) {
    const aloud = h('input', { type: 'checkbox', checked: c.read_aloud !== false,
      onchange: (e) => set({ read_aloud: e.target.checked }) });
    return h('div', {},
      field('Heading (optional)', textInput(c.title, (v) => set({ title: v }), { maxLength: 80 })),
      field('Note', textArea(c.text, (v) => set({ text: v }),
        { placeholder: 'Short sentences read best. Each new line is read and highlighted on its own.' })),
      h('label', { class: 'check' }, aloud, ' Read it aloud (when automatic read-aloud is on in Evergreen; it’s off by default)'));
  },

  play(stage, c, kit) {
    const lines = c.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return readAloud(stage, kit, { title: c.title?.trim() || null, lines, speak: c.read_aloud !== false });
  },
};
