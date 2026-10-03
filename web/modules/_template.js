// _template.js - copy this file to make a new module (it is NOT registered itself).
//
//   1. cp web/modules/_template.js web/modules/my-module.js
//   2. Fill in the fields below.
//   3. In web/modules/index.js: import it and add it to MODULES.
//   Done: the Studio shows it in "Add a module", and tablets can play it.
//
// Rules every module must follow (see docs/MODULES.md):
//   - Never store Scripture text or prayer text in `config` (use the scripture/prayer modules).
//   - No scores, streaks, or "wrong!" messages: keep it gentle.
//   - Big text (≥ 28 px) and big buttons (≥ 64 px); use the classes in web/css/app.css.
import { field, h, textInput } from './kit.js';

export default {
  // Saved in the database for each item: lowercase letters, digits, - or _. Never change it
  // once plans use it.
  type: 'my-module',
  name: 'My Module',               // shown in the Studio's module palette
  icon: '★',                       // one short symbol for the palette and the plan outline
  description: 'One sentence about what the resident sees.',
  musicBed: true,                  // true: a hymn sung just before keeps playing softly underneath

  /** Settings for a newly added module (what the editor starts with). */
  defaults: () => ({ text: '' }),

  /** Problems that block saving, as friendly sentences. [] = fine. `lib` gives lib.hymn(id), lib.prayer(id). */
  validate(c /* , lib */) {
    return c.text?.trim() ? [] : ['Write something.'];
  },

  /** One line shown in the plan outline. */
  summary: (c) => c.text || 'Empty',

  /**
   * Studio form, drawn from the config snapshot `c`.
   *   set(patch)                    merge changes into the config (e.g. set({ text: v }))
   *   set(patch, { redraw: true })  …and redraw this form (after adding/removing parts)
   *   get()                         the latest config (use it in handlers, not `c`)
   *   lib                           published hymns/prayers: lib.hymns, lib.hymn(id), lib.prayers, lib.prayer(id)
   */
  editor(c, { set /* , get, lib */ }) {
    return field('Text', textInput(c.text, (v) => set({ text: v })));
  },

  /**
   * Tablet player: draw into `stage` (the big content card). `kit` has audio, speaker, api,
   * and paused() (true if the aide has paused: don't start sound then).
   * Return a controller; every method is optional except stop():
   *   { againLabel, again(), pause(), resume(), stop(), musicUrl }
   */
  play(stage, c, kit) {
    stage.replaceChildren(h('p', { class: 'big-text' }, c.text));
    if (!kit.paused()) kit.speaker.speakText(c.text).catch(() => {});
    return {
      againLabel: 'Read again',
      again: () => kit.speaker.speakText(c.text).catch(() => {}),
      pause: () => kit.speaker.pause(),
      resume: () => kit.speaker.resume(),
      stop: () => kit.speaker.stop(),
    };
  },
};
