// lyrics.js - sing-along words: shows the current stanza as large lines and highlights
// the word being sung, following the audio position. Timing helpers ported from v1
// (public/js/lyrics.js); the view is new (big stanza lines instead of a scrolling strip).
//
// Data: a hymn's timing JSON (api.getTiming). If data.synced is false, the words are
// shown without highlighting.

// Show each word slightly before it's sung (karaoke-style), so singers can read ahead.
export const SING_LEAD = 0.08;

/** Index of the last item whose time is <= t (items sorted by time), or -1. */
export function lastAtOrBefore(items, t, time = (x) => x) {
  let lo = 0, hi = items.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (time(items[mid]) <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

/** Which stanza is playing at time t: its index, or -1 during the intro. */
export const stanzaAt = (data, t) => lastAtOrBefore(data.stanzas, t, (s) => s.start);

/** How many different stanzas the hymn has ("verse X of Y"). Repeat passes don't count. */
export const verseTotal = (data) => (data.stanzas ?? []).filter((s) => s.repeatOf == null).length;

const el = (tag, className, text) => Object.assign(document.createElement(tag), { className, textContent: text ?? '' });

export class LyricsView {
  /**
   * root: element to draw into.
   * getTime(): current audio position in seconds, or null when not playing.
   * onVerse({ n, total, intro }): called when the stanza changes (for "Verse 2 of 5").
   */
  constructor(root, { getTime, onVerse } = {}) {
    this.root = root;
    this.getTime = getTime;
    this.onVerse = onVerse;
    this.data = null;
    this.stanza = null;   // index drawn now
    this.words = [];      // [{ el, t }] for the drawn stanza
    this.current = -1;
    this.raf = 0;
  }

  /** Show a hymn's words (timing JSON). */
  setData(data) {
    this.stop();
    this.data = data;
    this.stanza = null;
    this.root.replaceChildren();
    if (!data?.stanzas?.length) {
      this.root.append(el('p', 'lyric-note', 'Words are not available for this hymn.'));
      return;
    }
    if (!data.synced) {
      // Timing couldn't be verified: show every stanza plainly, no highlighting.
      for (const s of data.stanzas.filter((x) => x.repeatOf == null)) this.#drawStanza(s, false);
      this.onVerse?.({ n: null, total: verseTotal(data), intro: false });
      return;
    }
    this.#show(0, true);
  }

  /** Follow the audio (call after playback starts). */
  start() {
    cancelAnimationFrame(this.raf);
    if (!this.data?.synced) return;
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.#update();
    };
    tick();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  #drawStanza(stanza, withTimes) {
    const block = el('div', 'lyric-stanza');
    const words = [];
    for (const line of stanza.lines) {
      const p = el('p', 'lyric-line');
      line.forEach((w, i) => {
        if (i) p.append(' ');
        const span = el('span', 'lyric-word', w.text);
        p.append(span);
        if (withTimes) words.push({ el: span, t: w.t });
      });
      block.append(p);
    }
    this.root.append(block);
    return words;
  }

  // Draw stanza i (intro = before the first stanza starts).
  #show(i, intro) {
    const s = this.data.stanzas[Math.max(0, i)];
    this.stanza = i;
    this.current = -1;
    this.root.replaceChildren();
    this.root.classList.toggle('lyric-intro', intro);
    this.words = this.#drawStanza(s, true);
    this.onVerse?.({ n: s.n, total: verseTotal(this.data), intro });
  }

  #update() {
    const pos = this.getTime?.();
    if (pos == null) return;
    const t = pos + SING_LEAD;
    const i = stanzaAt(this.data, t);
    if (i < 0) {
      if (this.stanza !== -1) this.#show(-1, true); // intro: show stanza 1, nothing lit yet
      return;
    }
    if (i !== this.stanza) this.#show(i, false);
    const w = lastAtOrBefore(this.words, t, (x) => x.t);
    if (w === this.current) return;
    this.words.forEach((x, k) => x.el.classList.toggle('sung', k < w));
    this.words[this.current]?.el.classList.remove('now');
    this.words[w]?.el.classList.add('now');
    this.current = w;
    // Keep the current word visible if the stanza is taller than the card.
    const now = this.words[w]?.el;
    if (now && this.root.scrollHeight > this.root.clientHeight) {
      const top = now.offsetTop - this.root.offsetTop - this.root.clientHeight / 3;
      if (Math.abs(this.root.scrollTop - top) > 40) this.root.scrollTop = Math.max(0, top);
    }
  }
}
