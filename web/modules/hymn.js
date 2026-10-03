// Hymn module: a published hymn with sing-along words (and sheet music on request).
import { refLabel } from '../js/books.js';
import { hymnPanel } from '../js/hymn-panel.js';
import { field, h, searchSelect } from './kit.js';

export default {
  type: 'hymn',
  name: 'Hymn',
  icon: '♪',
  description: 'A familiar hymn with the words lit up as they are sung.',
  musicBed: false, // it IS the music: it starts its own audio

  defaults: () => ({ hymn_id: null, sheet: false }),

  validate(c, lib) {
    if (!c.hymn_id) return ['Choose a hymn.'];
    if (lib && !lib.hymn(c.hymn_id)) return ['That hymn is no longer published: choose another.'];
    return [];
  },

  summary(c, lib) {
    const x = lib.hymn(c.hymn_id);
    return x ? `#${x.number} ${x.title}` : 'No hymn chosen';
  },

  editor(c, { lib, set }) {
    const items = lib.hymns.map((x) => ({
      value: x.id, label: `#${x.number}  ${x.title}`, search: `${x.number} ${x.title} ${x.first_line ?? ''}`,
    }));
    const sheet = h('input', { type: 'checkbox', checked: Boolean(c.sheet),
      onchange: (e) => set({ sheet: e.target.checked }) });
    return h('div', {},
      field('Hymn', searchSelect(items, c.hymn_id, (v) => set({ hymn_id: Number(v) }),
        { placeholder: 'Search hymns by title, number, or first line…' })),
      h('label', { class: 'check' }, sheet, ' Open with the sheet music showing'));
  },

  async play(stage, c, kit) {
    const hymn = await kit.api.getHymnById(c.hymn_id);
    if (!hymn) {
      stage.replaceChildren(h('p', { class: 'big-text muted' }, 'This hymn isn’t available right now.'));
      return { stop() {} };
    }
    const refs = await kit.api.getHymnRefs(hymn.id).catch(() => []);
    const r = refs[0];
    const panel = hymnPanel(kit, hymn, { basedOn: r ? refLabel(r.book, r.chapter, r.verse_start, r.verse_end) : null });
    stage.replaceChildren(panel.el);
    if (c.sheet) panel.el.querySelector('.row .pill')?.click(); // "Show sheet music"
    if (!kit.paused()) await panel.start({ loop: false });
    return {
      againLabel: 'Sing again',
      musicUrl: panel.url, // later modules can keep this hymn playing softly underneath
      again: () => panel.restart(),
      pause: () => kit.audio.pause(),
      resume: () => (kit.audio.currentUrl ? kit.audio.resume() : panel.restart()),
      stop: () => panel.stop(),
    };
  },
};
