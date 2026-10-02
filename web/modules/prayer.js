// Prayer module: a prayer from the library (Book of Common Prayer etc.), read line by line.
// Authors pick from the library only; new prayers are added by an admin with a source.
import { field, h, readAloud, searchSelect, splitLines } from './kit.js';

export default {
  type: 'prayer',
  name: 'Prayer',
  icon: '✦',
  description: 'A prayer from the library, read aloud line by line, with its source.',
  musicBed: true,

  defaults: () => ({ prayer_id: null }),

  validate(c, lib) {
    if (!c.prayer_id) return ['Choose a prayer.'];
    if (lib && !lib.prayer(c.prayer_id)) return ['That prayer is no longer published: choose another.'];
    return [];
  },

  summary: (c, lib) => lib.prayer(c.prayer_id)?.title ?? 'No prayer chosen',

  editor(c, { lib, set }) {
    const items = lib.prayers.map((p) => ({
      value: p.id, label: `${p.title}  ·  ${p.attribution ?? p.source}`, search: `${p.title} ${p.text}`,
    }));
    const chosen = lib.prayer(c.prayer_id);
    return h('div', {},
      field('Prayer', searchSelect(items, c.prayer_id, (v) => set({ prayer_id: Number(v) }, { redraw: true }), // redraw shows the text
        { placeholder: 'Search prayers…' })),
      chosen && h('blockquote', { class: 'preview-text' }, chosen.text));
  },

  async play(stage, c, kit) {
    const prayer = await kit.api.getPrayerById(c.prayer_id);
    if (!prayer) {
      stage.replaceChildren(h('p', { class: 'big-text muted' }, 'This prayer isn’t available right now.'));
      return { stop() {} };
    }
    return readAloud(stage, kit, {
      title: prayer.title,
      lines: splitLines(prayer.text),
      footer: prayer.attribution ?? prayer.source, // always show where a prayer comes from
      centered: true,
    });
  },
};
