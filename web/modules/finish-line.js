// "Finish the Line" game: the start of a hymn line is shown with its last words hidden.
// "Play the line" plays just that line of the recording (using the word timings) and
// "Show the words" reveals the rest. Gentle: nothing is scored.
import { field, h, numberInput, searchSelect } from './kit.js';

export default {
  type: 'finish-line',
  name: 'Finish the Line',
  icon: '…',
  description: 'A sing-along game: hear the start of a hymn line and finish the words together.',
  musicBed: false, // it plays the hymn's own lines

  defaults: () => ({ hymn_id: null, stanza: 1, lines: 4 }),

  validate(c, lib) {
    if (!c.hymn_id) return ['Choose a hymn.'];
    const x = lib?.hymn(c.hymn_id);
    if (lib && !x) return ['That hymn is no longer published: choose another.'];
    if (x && !x.timing_verified) return ['This hymn has no word timings, so it can’t be used for the game.'];
    if (x && x.stanza_count && c.stanza > x.stanza_count) return [`That hymn has ${x.stanza_count} verses.`];
    if (!(c.lines >= 1 && c.lines <= 8)) return ['Use between 1 and 8 lines.'];
    return [];
  },

  summary: (c, lib) => {
    const x = lib.hymn(c.hymn_id);
    return x ? `${x.title} · verse ${c.stanza}, ${c.lines} line${c.lines === 1 ? '' : 's'}` : 'No hymn chosen';
  },

  editor(c, { lib, set }) {
    const items = lib.hymns.filter((x) => x.timing_verified).map((x) => ({
      value: x.id, label: `#${x.number}  ${x.title}`, search: `${x.number} ${x.title} ${x.first_line ?? ''}`,
    }));
    return h('div', {},
      field('Hymn', searchSelect(items, c.hymn_id, (v) => set({ hymn_id: Number(v) }),
        { placeholder: 'Search hymns…' })),
      h('div', { class: 'field-row' },
        field('Verse', numberInput(c.stanza, (v) => set({ stanza: v }), { min: 1, max: 20 })),
        field('How many lines', numberInput(c.lines, (v) => set({ lines: v }), { min: 1, max: 8 }))));
  },

  async play(stage, c, kit) {
    const hymn = await kit.api.getHymnById(c.hymn_id);
    const timing = hymn && await kit.api.getTiming(hymn).catch(() => null);
    const stanzas = (timing?.stanzas ?? []).filter((s) => s.repeatOf == null);
    const stanza = stanzas[(c.stanza ?? 1) - 1];
    if (!hymn || !timing?.synced || !stanza) {
      stage.replaceChildren(h('p', { class: 'big-text muted' }, 'This game isn’t available right now.'));
      return { stop() {} };
    }
    const lines = stanza.lines.slice(0, c.lines);
    const url = kit.api.audioUrl(hymn);
    let n = 0, raf = 0;

    // When does line i end? At the next line's first word, or the end of the verse.
    const endOf = (i) => (stanza.lines[i + 1]?.[0]?.t ?? stanza.end);

    function stopClip() { cancelAnimationFrame(raf); if (kit.audio.currentUrl) kit.audio.pause(); }

    async function playLine(i) {
      stopClip();
      const from = Math.max(0, lines[i][0].t - 0.4), to = endOf(i) + 0.2;
      await kit.audio.play(url, { from, fade: 0.2 }).catch(() => {});
      if (kit.audio.currentUrl === url) kit.audio.seek(from); // already loaded: jump back
      await kit.audio.resume();
      const watch = () => { raf = requestAnimationFrame(watch); if ((kit.audio.position ?? 0) >= to) stopClip(); };
      watch();
    }

    function show() {
      const words = lines[n].map((w) => w.text);
      const hide = Math.min(3, Math.max(1, Math.round(words.length / 3)));
      const shown = words.slice(0, words.length - hide).join(' ');
      const hidden = words.slice(words.length - hide).join(' ');
      const blank = h('span', { class: 'finish-blank', 'aria-label': 'hidden words' }, '_ '.repeat(hide).trim());
      const line = h('p', { class: 'finish-line big-text' }, `${shown} `, blank);
      const next = n < lines.length - 1
        ? h('button', { class: 'pill primary', type: 'button', onclick: () => { n++; show(); } }, 'Next line')
        : h('p', { class: 'muted' }, 'That’s the last line. Lovely singing!');
      stage.replaceChildren(h('div', { class: 'finish' },
        h('p', { class: 'muted' }, `${hymn.title} · line ${n + 1} of ${lines.length}`),
        h('h2', { class: 'title' }, 'Finish the line'),
        line,
        h('div', { class: 'row' },
          h('button', { class: 'pill', type: 'button', onclick: () => playLine(n) }, '♪ Play the line'),
          h('button', { class: 'pill', type: 'button', onclick: () => {
            blank.textContent = hidden;
            blank.classList.add('revealed');
            blank.removeAttribute('aria-label');
          } }, 'Show the words')),
        next));
    }

    show();
    if (!kit.paused()) playLine(0);
    return {
      againLabel: 'Start again',
      again: () => { n = 0; show(); playLine(0); },
      pause: () => stopClip(),
      resume: () => playLine(n),
      stop: () => stopClip(),
    };
  },
};
