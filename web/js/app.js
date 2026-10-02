// app.js - starts the public app: shared audio/speech, settings, and a tiny hash router.
//   #/            Home (simple mode)       #/sing        Sing a Hymn (grid)
//   #/studies     Choose a Study (list)    #/sing/19     Sing one hymn
//   #/study/12    One study plan
//   #/done        Session finished         #/aide        Aide tools
//   #/read        Read the Bible
import { AudioPlayer } from './audio.js';
import { Speaker, localVoices } from './speech.js';
import { store } from './store.js';
import { h } from './ui.js';
import * as home from './screens/home.js';
import * as studies from './screens/studies.js';
import * as study from './screens/study.js';
import * as preview from './screens/preview.js';
import * as done from './screens/done.js';
import * as sing from './screens/sing.js';
import * as aide from './screens/aide.js';
import * as read from './screens/read.js';

const settings = store.settings();
const audio = new AudioPlayer({ volume: settings.volume });
const speaker = new Speaker({ ducker: audio, rate: settings.rate });

// Use the saved voice if this tablet still has it (local voices only).
const voicesReady = localVoices().then((voices) => {
  speaker.setVoice(voices.find((v) => v.name === settings.voiceName) ?? null);
  return voices;
});

let unlocked = false;
const ctx = {
  audio,
  speaker,
  store,
  voicesReady,
  get unlocked() { return unlocked; },
  /** Must run inside a tap: browsers (iPad especially) only allow sound after one. */
  async unlock() {
    const ok = audio.unlock();   // creates the AudioContext synchronously, inside the tap
    speaker.unlock();
    unlocked = await ok;
    return unlocked;
  },
  go(hash) { location.hash = hash; },
};

// After the tablet sleeps, iOS suspends audio: any tap brings it back.
document.addEventListener('pointerdown', () => { if (unlocked) audio.unlock(); }, { capture: true });

const ROUTES = [
  [/^\/?$/, home, false],
  [/^\/studies$/, studies, false],
  [/^\/study\/(\d+)$/, study, true],
  [/^\/preview$/, preview, true],   // the Studio's preview frame
  [/^\/session$/, { render: (_r, _p, c) => c.go('#/studies') }, false], // old links: the day-based session is now the study list
  [/^\/done$/, done, false],
  [/^\/sing$/, sing, false],
  [/^\/sing\/(\d+)$/, sing, true],
  [/^\/aide$/, aide, false],
  [/^\/read$/, read, true],
];

const root = document.getElementById('app');
let cleanup = null;
let renderId = 0;

async function route() {
  const id = ++renderId;
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  let match = null, screen = home, needsSound = false;
  for (const [re, mod, sound] of ROUTES) {
    match = re.exec(path || '/');
    if (match) { screen = mod; needsSound = sound; break; }
  }
  params.arg = match?.[1];

  // Leave the previous screen cleanly (stop speech, fade music, stop animations).
  try { cleanup?.(); } catch (err) { console.error(err); }
  cleanup = null;
  speaker.stop();

  // Opened directly (bookmark, reload): one tap is needed before sound can start.
  if (needsSound && !unlocked) {
    root.replaceChildren(h('div', { class: 'screen tap-to-start' },
      h('h1', { class: 'sr-only', tabindex: '-1' }, 'Hymnal Reader'),
      h('button', {
        class: 'tile primary', type: 'button',
        onclick: async () => { await ctx.unlock(); if (id === renderId) route(); },
      }, h('span', { class: 'tile-title' }, 'Tap to continue'))));
    return;
  }

  root.replaceChildren();
  try {
    const result = await screen.render(root, params, ctx);
    if (id === renderId) cleanup = result ?? null;
    else result?.();
  } catch (err) {
    console.error(err);
    if (id !== renderId) return;
    root.replaceChildren(h('div', { class: 'screen message' },
      h('h1', { class: 'big-text', tabindex: '-1' }, 'Something went wrong loading this page.'),
      h('p', { class: 'muted' }, err.message),
      h('button', { class: 'pill primary', onclick: () => ctx.go('#/') }, 'Go Home')));
  }
  root.querySelector('h1')?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
route();
