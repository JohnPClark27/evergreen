// speech.js - read Scripture and prayers aloud with the device's own voices.
//
// Built on the browser's Web Speech API, using LOCAL system voices only (no cloud voices).
// Design choices, mostly for iPad Safari:
// - One utterance per verse (or prayer line). Long utterances can stop silently on iOS, and
//   short ones give us "now reading verse N" events for highlighting.
// - Pause = cancel + remember where we were; Resume re-reads the current verse from its start.
//   (speechSynthesis.pause()/resume() are unreliable on iOS.)
// - While speaking, the music is "ducked" to ~25% through audio.js, then restored.
//
// Events (EventTarget): 'segment' {detail: {index, text}}, 'state' {detail: 'idle'|'speaking'|'paused'},
//                       'end' (finished reading everything; not fired on stop()).

export const RATES = { slower: 0.6, slow: 0.8, normal: 1.0 };
const synth = window.speechSynthesis;

export const speechSupported = Boolean(synth && window.SpeechSynthesisUtterance);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Split a prayer into short lines for reading + highlighting: its own line breaks first,
 * then sentences/clauses (. ; : ? !). Tiny pieces are joined to the next one. */
export function splitLines(text) {
  const out = [];
  for (const line of text.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
    const parts = line.match(/[^.;:?!]+[.;:?!]+["'’”)]*\s*|[^.;:?!]+$/g) ?? [line];
    let carry = '';
    for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
      carry = carry ? `${carry} ${p}` : p;
      if (carry.length >= 25) { out.push(carry); carry = ''; }
    }
    if (carry) {
      if (out.length && carry.length < 12) out[out.length - 1] += ` ${carry}`;
      else out.push(carry);
    }
  }
  return out;
}

/** Local (on-device) voices, English first. Waits briefly for voices to load. */
export async function localVoices() {
  if (!speechSupported) return [];
  let voices = synth.getVoices();
  if (!voices.length) {
    await new Promise((resolve) => {
      synth.addEventListener('voiceschanged', resolve, { once: true });
      setTimeout(resolve, 1500); // some browsers never fire it
    });
    voices = synth.getVoices();
  }
  const local = voices.filter((v) => v.localService); // no network (cloud) voices
  const english = (v) => /^en\b/i.test(v.lang);
  return local.sort((a, b) => (english(b) - english(a)) || (b.default - a.default) || a.name.localeCompare(b.name));
}

export class Speaker extends EventTarget {
  constructor({ ducker = null, rate = 'slow', pauseMs = 900, duckLevel = 0.25 } = {}) {
    super();
    this.ducker = ducker;       // anything with duck(level) / unduck(), e.g. AudioPlayer
    this.rateName = rate in RATES ? rate : 'slow';
    this.pauseMs = pauseMs;     // silence between verses
    this.duckLevel = duckLevel;
    this.voice = null;
    this.segments = [];
    this.index = 0;
    this.state = 'idle';
    this.token = 0;             // bumped on every stop/pause so old loops quit
    // Studies turn this off unless the aide switched read-aloud on (off by default: the
    // built-in voices still sound robotic). While off, speak calls do nothing at all.
    this.enabled = true;
  }

  get rate() { return RATES[this.rateName]; }
  setRate(name) { if (name in RATES) this.rateName = name; }
  setVoice(voice) { this.voice = voice ?? null; }

  /** Call once from a tap: iOS only allows speech that a tap started. */
  unlock() {
    if (!speechSupported) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }

  /** Read verses [{num, text}] one at a time. Resolves when done or stopped. */
  speakVerses(verses) {
    return this.#start(verses.map((v) => v.text));
  }

  /** Read a prayer line by line (see splitLines). Resolves when done or stopped. */
  speakText(text) {
    return this.#start(splitLines(text));
  }

  pause() {
    if (this.state !== 'speaking') return;
    this.token++;
    synth.cancel();
    this.#setState('paused');
    this.ducker?.unduck();
  }

  resume() {
    if (this.state !== 'paused') return Promise.resolve();
    return this.#run(); // re-reads the current verse from its start
  }

  /** Read again from the beginning. */
  repeat() {
    if (!this.segments.length) return Promise.resolve();
    this.token++;
    synth.cancel();
    this.index = 0;
    return this.#run();
  }

  stop() {
    this.token++;
    if (speechSupported) synth.cancel();
    this.index = 0;
    if (this.state !== 'idle') {
      this.#setState('idle');
      this.ducker?.unduck();
    }
  }

  #start(segments) {
    this.stop();
    if (!this.enabled) return Promise.resolve(); // read-aloud is off: show the text only
    this.segments = segments;
    this.index = 0;
    return this.#run();
  }

  #setState(state) {
    this.state = state;
    this.dispatchEvent(new CustomEvent('state', { detail: state }));
  }

  async #run() {
    if (!speechSupported) throw new Error('This browser cannot read aloud.');
    const token = ++this.token;
    synth.cancel();
    await sleep(60); // Chrome can drop a speak() issued right after cancel()
    if (token !== this.token) return;
    this.#setState('speaking');
    this.ducker?.duck(this.duckLevel);

    while (this.index < this.segments.length) {
      const text = this.segments[this.index];
      this.dispatchEvent(new CustomEvent('segment', { detail: { index: this.index, text } }));
      await this.#say(text, token);
      if (token !== this.token) return; // paused or stopped meanwhile
      this.index++;
      if (this.index < this.segments.length) {
        await sleep(this.pauseMs);
        if (token !== this.token) return;
      }
    }
    this.index = 0;
    this.#setState('idle');
    this.ducker?.unduck();
    this.dispatchEvent(new Event('end'));
  }

  // Speak one piece. Resolves on 'end'/'error', or when the engine has gone quiet
  // (Safari sometimes never fires 'end').
  #say(text, token) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = this.rate;
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else { u.lang = 'en-US'; }
      let done = false;
      const finish = () => { if (!done) { done = true; clearInterval(watch); resolve(); } };
      u.onend = finish;
      u.onerror = finish;
      const started = Date.now();
      const watch = setInterval(() => {
        if (token !== this.token) finish();
        else if (Date.now() - started > 1500 && !synth.speaking && !synth.pending) finish();
      }, 400);
      synth.speak(u);
    });
  }
}
