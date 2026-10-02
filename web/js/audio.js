// audio.js - hymn playback: two decks with crossfades, a duck control for speech,
// and a master volume. Ported from v1 (public/js/crossfader.js).
//
// Audio graph:
//   <audio A> -> MediaElementSource -> gain A ─┐
//                                              ├─> duck gain -> master gain -> speakers
//   <audio B> -> MediaElementSource -> gain B ─┘
//
// - Crossfade: load the new track on the idle deck at gain 0, then ramp it up while the
//   other deck ramps down. GainNodes give smooth ramps and work on iOS (element.volume
//   is read-only there).
// - Duck: speech.js lowers the duck gain (~25%) while it reads aloud, then restores it.
//   Kept separate from the master gain so the aide's volume setting is never lost.
// - Each MP3 is downloaded once per session and kept as a blob URL, so replaying a hymn
//   never re-downloads it (Free tier egress).
// - iOS only allows sound after a tap: call unlock() from a tap handler before anything else.

// 0.05 s of silence as a WAV data URI: played once per deck during unlock() so iOS treats
// both <audio> elements as user-started.
const SILENT_WAV = (() => {
  const samples = 2205, bytes = new Uint8Array(44 + samples * 2);
  const v = new DataView(bytes.buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples * 2, true);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(bin)}`;
})();

export class AudioPlayer extends EventTarget {
  constructor({ volume = 0.8 } = {}) {
    super();
    this.ctx = null;
    this.decks = [];
    this.active = 0;          // deck that is (or was last) audible
    this.currentUrl = null;   // source URL of the audible track (not the blob URL)
    this.userPaused = false;
    this.volume = volume;
    this.blobs = new Map();   // source URL -> Promise<blob URL>, for the whole session
  }

  get ready() { return this.ctx !== null && this.ctx.state === 'running'; }

  /** Call from a tap/click handler. Safe to call again (e.g. after the tablet slept). */
  async unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.duckGain = this.ctx.createGain();
      this.duckGain.connect(this.master).connect(this.ctx.destination);
      this.decks = [0, 1].map((i) => {
        const el = new Audio();
        el.crossOrigin = 'anonymous'; // needed if a non-blob URL is ever used with Web Audio
        el.preload = 'auto';
        el.addEventListener('ended', () => {
          if (i === this.active && !el.loop) {
            this.currentUrl = null;
            this.dispatchEvent(new Event('ended'));
          }
        });
        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        this.ctx.createMediaElementSource(el).connect(gain).connect(this.duckGain);
        return { el, gain };
      });
      // Start both elements inside this tap (iOS), silently.
      await Promise.all(this.decks.map(async ({ el }) => {
        el.src = SILENT_WAV;
        try { await el.play(); el.pause(); } catch { /* not fatal: real play() may still work */ }
      }));
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ready;
  }

  /** Download a track once per session; returns a blob URL. */
  load(url) {
    if (!this.blobs.has(url)) {
      this.blobs.set(url, fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Couldn't load the hymn audio (${res.status}).`);
        return res.blob();
      }).then((blob) => URL.createObjectURL(blob)).catch((err) => { this.blobs.delete(url); throw err; }));
    }
    return this.blobs.get(url);
  }

  setVolume(volume) {
    this.volume = volume;
    if (this.ctx) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
  }

  // Move a gain smoothly from where it is now to `target` over `seconds`.
  #ramp(param, target, seconds) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + Math.max(0.01, seconds));
  }

  /** Lower the music while speech plays (level 0-1 of the current volume). */
  duck(level = 0.25, seconds = 0.4) {
    if (this.ctx) this.#ramp(this.duckGain.gain, level, seconds);
  }

  unduck(seconds = 0.8) {
    if (this.ctx) this.#ramp(this.duckGain.gain, 1, seconds);
  }

  get duckLevel() { return this.ctx ? this.duckGain.gain.value : 1; }

  /** Crossfade to `url`. Rejects if it can't be loaded or played; the old track keeps playing. */
  async play(url, { loop = false, fade = 1.5, from = 0 } = {}) {
    if (!this.ctx) throw new Error('Call unlock() from a tap first.');
    if (url === this.currentUrl) return this.resume();
    const blobUrl = await this.load(url);
    const incoming = this.decks[1 - this.active];
    const outgoing = this.decks[this.active];

    incoming.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    incoming.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    incoming.el.loop = loop;
    incoming.el.src = blobUrl;
    incoming.el.currentTime = from;
    await incoming.el.play();
    this.userPaused = false;

    this.active = 1 - this.active;
    this.currentUrl = url;
    this.#ramp(incoming.gain.gain, 1, fade);
    this.#fadeOutDeck(outgoing, fade);
    this.dispatchEvent(new Event('play'));
  }

  /** Fade everything to silence. */
  stop(fade = 1) {
    if (!this.ctx) return;
    this.currentUrl = null;
    for (const deck of this.decks) this.#fadeOutDeck(deck, fade);
    this.dispatchEvent(new Event('stop'));
  }

  #fadeOutDeck(deck, seconds) {
    this.#ramp(deck.gain.gain, 0, seconds);
    // Once silent, pause it to save battery, unless meanwhile a new track started on it.
    setTimeout(() => {
      const nowAudible = deck === this.decks[this.active] && this.currentUrl !== null;
      if (!nowAudible) deck.el.pause();
    }, seconds * 1000 + 100);
  }

  // Pause really pauses the elements (not just the context): otherwise some browsers keep
  // the element clock running and the highlighted words would run ahead of the music.
  async pause() {
    if (!this.ctx) return;
    this.userPaused = true;
    for (const deck of this.decks) deck.el.pause();
    this.dispatchEvent(new Event('pause'));
  }

  async resume() {
    if (!this.ctx) return;
    this.userPaused = false;
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const deck = this.decks[this.active];
    if (this.currentUrl !== null) await deck.el.play().catch(() => {});
    this.dispatchEvent(new Event('play'));
  }

  /** Jump the audible track (e.g. "Sing again" = restart(0)). */
  seek(seconds) {
    const el = this.decks[this.active]?.el;
    if (el && this.currentUrl !== null) el.currentTime = Math.max(0, seconds);
  }

  get paused() { return !this.ctx || this.userPaused || this.currentUrl === null; }

  get duration() {
    const d = this.decks[this.active]?.el.duration;
    return Number.isFinite(d) ? d : null;
  }

  /** Playback position (s) of the audible track, adjusted for output latency so word
   * highlights line up with what you hear. null when nothing is playing. */
  get position() {
    const el = this.decks[this.active]?.el;
    if (!el || this.currentUrl === null) return null;
    // Capped: some browsers report a bogus, ever-growing latency.
    const latency = Math.min(0.3, this.ctx.outputLatency || this.ctx.baseLatency || 0);
    let t = el.currentTime - latency;
    if (t < 0 && el.loop && el.duration) t += el.duration; // just looped back to the start
    return Math.max(0, t);
  }
}
