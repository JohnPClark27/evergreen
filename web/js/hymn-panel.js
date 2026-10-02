// hymn-panel.js - one hymn on screen: title, "Based on …", "Verse X of Y", large sing-along
// words, and a "Show sheet music" switch. Used by the Session (step 1) and Sing a Hymn.
import * as api from './api.js';
import { LyricsView } from './lyrics.js';
import { createSheet } from './sheet.js';
import { h } from './ui.js';

export function hymnPanel(ctx, hymn, { basedOn = null } = {}) {
  const { audio } = ctx;
  const url = api.audioUrl(hymn);
  const verseLabel = h('p', { class: 'verse-label', 'aria-live': 'polite' });
  const words = h('div', { class: 'lyrics' });
  const sheetBox = h('div', { class: 'sheet', hidden: true });
  const sheetStatus = h('p', { class: 'muted small' });
  const toggle = h('button', { class: 'pill', type: 'button', 'aria-pressed': 'false' }, 'Show sheet music');

  const lyrics = new LyricsView(words, {
    getTime: () => audio.position,
    onVerse: ({ n, total, intro }) => {
      verseLabel.textContent = intro ? 'Introduction' : n ? `Verse ${n} of ${total}` : `${total} verses`;
    },
  });
  const sheet = createSheet(sheetBox, { getTime: () => audio.position, onStatus: (s) => { sheetStatus.textContent = s; } });
  let timing = null;
  let sheetShown = false;

  toggle.addEventListener('click', async () => {
    sheetShown = !sheetShown;
    toggle.textContent = sheetShown ? 'Show words' : 'Show sheet music';
    toggle.setAttribute('aria-pressed', String(sheetShown));
    words.hidden = sheetShown;
    sheetBox.hidden = !sheetShown;
    if (sheetShown && timing) {
      if (!sheetBox.childElementCount) await sheet.show(timing);
      sheet.start();
    } else {
      sheet.stop();
    }
  });

  const el = h('div', { class: 'hymn-panel' },
    h('h2', { class: 'title' }, hymn.title),
    basedOn && h('p', { class: 'muted' }, `Based on ${basedOn}`),
    verseLabel,
    words,
    sheetBox,
    h('div', { class: 'row' }, toggle, sheetStatus));

  return {
    el,
    /** Load the words and start singing (call after the audio is unlocked). */
    async start({ loop = false } = {}) {
      timing = await api.getTiming(hymn).catch(() => null);
      if (timing) lyrics.setData(timing);
      else words.replaceChildren(h('p', { class: 'muted' }, 'The words for this hymn are not available.'));
      if (url) {
        await audio.play(url, { loop });
        lyrics.start();
      }
    },
    /** "Sing again": back to the start of the hymn. */
    async restart() {
      if (audio.currentUrl === url) { audio.seek(0); await audio.resume(); }
      else if (url) await audio.play(url, { fade: 0.5 });
      lyrics.start();
      if (sheetShown) sheet.start();
    },
    stop() { lyrics.stop(); sheet.stop(); },
    url,
  };
}
