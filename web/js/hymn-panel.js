// hymn-panel.js - one hymn on screen: title, "Based on …", "Verse X of Y", large sing-along
// words, and a "Show sheet music" switch. Used by the hymn module and Sing a Hymn.
//
// The switch sits in a bar just above the words that sticks to the top of the card while it
// scrolls, so "Close sheet music" is always in the same place, however far down the music goes.
import * as api from './api.js';
import { LyricsView } from './lyrics.js';
import { createSheet } from './sheet.js';
import { h, icon } from './ui.js';

export function hymnPanel(ctx, hymn, { basedOn = null } = {}) {
  const { audio } = ctx;
  const url = api.audioUrl(hymn);
  const verseLabel = h('p', { class: 'verse-label', 'aria-live': 'polite' });
  const words = h('div', { class: 'lyrics' });
  const sheetBox = h('div', { class: 'sheet', hidden: true });
  const sheetStatus = h('p', { class: 'verse-label', hidden: true });
  const toggle = h('button', { class: 'pill big sheet-toggle', type: 'button', 'aria-pressed': 'false' });
  const drawToggle = () => toggle.replaceChildren(
    icon(sheetShown ? 'close' : 'music'),
    h('span', { class: 'label' }, sheetShown ? 'Close sheet music' : 'Show sheet music'));
  const bar = h('div', { class: 'hymn-bar' }, verseLabel, sheetStatus, toggle);

  const lyrics = new LyricsView(words, {
    getTime: () => audio.position,
    onVerse: ({ n, total, intro }) => {
      verseLabel.textContent = intro ? 'Introduction' : n ? `Verse ${n} of ${total}` : `${total} verses`;
    },
  });
  const sheet = createSheet(sheetBox, { getTime: () => audio.position, onStatus: (s) => { sheetStatus.textContent = s; } });
  let timing = null;
  let sheetShown = false;
  drawToggle();

  // After switching, if the card is scrolled past the top of the words / music, scroll back
  // so they start right under the bar (the bar itself never moves out of view).
  function showTop() {
    const card = el.closest('.card');
    const target = sheetShown ? sheetBox : words;
    if (!card) return;
    const gap = target.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
    if (gap < 0) card.scrollTop += gap;
  }

  toggle.addEventListener('click', async () => {
    sheetShown = !sheetShown;
    drawToggle();
    toggle.setAttribute('aria-pressed', String(sheetShown));
    toggle.classList.toggle('primary', sheetShown); // "Close" is filled, so it stands out
    words.hidden = sheetShown;
    sheetBox.hidden = !sheetShown;
    verseLabel.hidden = sheetShown;   // the music shows its own "Stanza 2 of 5 · page 1"
    sheetStatus.hidden = !sheetShown;
    showTop();
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
    bar,
    words,
    sheetBox);

  return {
    el,
    /** Load the words and start singing (call after the audio is unlocked). */
    async start({ loop = false } = {}) {
      timing = await api.getTiming(hymn).catch(() => null);
      if (timing) lyrics.setData(timing);
      else words.replaceChildren(h('p', { class: 'muted' }, 'The words for this hymn are not available.'));
      // The music may have been switched on before the timing loaded (e.g. "open with the sheet music").
      if (sheetShown && timing && !sheetBox.childElementCount) await sheet.show(timing);
      if (url) {
        await audio.play(url, { loop });
        lyrics.start();
        if (sheetShown) sheet.start();
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
    /** Open the sheet music (the hymn module's "open with the sheet music showing"). */
    showSheet() { if (!sheetShown) toggle.click(); },
    url,
  };
}
