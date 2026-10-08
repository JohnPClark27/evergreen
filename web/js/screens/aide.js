// Aide tools: read aloud (off by default), reading speed, music volume, voice; reset notes.
// Everything is saved on this tablet only (localStorage). No names are saved.
import { hubButton } from '../nav.js';
import { RATES } from '../speech.js';
import { confirmDialog, h, icon } from '../ui.js';

const RATE_LABEL = { slower: 'Slower', slow: 'Slow', normal: 'Normal' };

export async function render(root, _params, ctx) {
  const { store, speaker, audio } = ctx;
  const settings = store.settings();
  // ---- Read aloud in studies (off by default; the same switch is in each study's top bar) ----
  const aloud = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': 'Read aloud in studies' });
  function drawAloud() {
    const on = store.settings().readAloud === true;
    aloud.replaceChildren(...[[false, 'Off'], [true, 'On']].map(([value, label]) => h('button', {
      class: `pill${on === value ? ' selected' : ''}`, type: 'button', role: 'radio',
      'aria-checked': String(on === value),
      onclick: () => { store.setSettings({ readAloud: value }); drawAloud(); },
    }, label)));
  }

  // ---- Show AI reasoning (for the aide, and for judges): why each suggestion was picked ----
  const reasons = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': 'Show AI reasoning' });
  function drawReasons() {
    const on = store.settings().showReasons === true;
    reasons.replaceChildren(...[[false, 'Off'], [true, 'On']].map(([value, label]) => h('button', {
      class: `pill${on === value ? ' selected' : ''}`, type: 'button', role: 'radio',
      'aria-checked': String(on === value),
      onclick: () => { store.setSettings({ showReasons: value }); drawReasons(); },
    }, label)));
  }

  // ---- Reading speed ----
  const speed = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': 'Reading speed' });
  function drawSpeed() {
    speed.replaceChildren(...Object.keys(RATES).map((name) => h('button', {
      class: `pill${speaker.rateName === name ? ' selected' : ''}`, type: 'button', role: 'radio',
      'aria-checked': String(speaker.rateName === name),
      onclick: () => { speaker.setRate(name); store.setSettings({ rate: name }); drawSpeed(); },
    }, RATE_LABEL[name])));
  }

  // ---- Music volume ----
  const volume = h('input', {
    type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume), class: 'slider',
    'aria-label': 'Music volume',
    oninput: (e) => { const v = Number(e.target.value); audio.setVolume(v); store.setSettings({ volume: v }); },
  });

  // ---- Voice (this tablet's own voices only) ----
  const voiceSelect = h('select', { class: 'select', 'aria-label': 'Voice' }, h('option', { value: '' }, 'Default voice'));
  const voices = await ctx.voicesReady;
  voiceSelect.append(...voices.map((v) => h('option', { value: v.name, selected: v.name === settings.voiceName }, `${v.name} (${v.lang})`)));
  voiceSelect.addEventListener('change', () => {
    const v = voices.find((x) => x.name === voiceSelect.value) ?? null;
    speaker.setVoice(v);
    store.setSettings({ voiceName: v?.name ?? null });
  });
  const testVoice = h('button', {
    class: 'pill', type: 'button',
    onclick: async () => { await ctx.unlock(); speaker.speakText('This is how the reading will sound.'); },
  }, 'Test voice');

  // ---- Notes ----
  const notesStatus = h('p', { class: 'muted', 'aria-live': 'polite' });
  const resetBtn = h('button', {
    class: 'pill', type: 'button',
    onclick: async () => {
      if (await confirmDialog('Reset all notes on this device? “Enjoyed” and “Skip” marks on hymns, studies, suggestions and games will be cleared, with what My Day has learned.', { yes: 'Reset notes' })) {
        store.resetNotes();
        notesStatus.textContent = 'Notes were reset.';
      }
    },
  }, 'Reset notes…');

  root.append(h('div', { class: 'screen aide' },
    h('header', { class: 'topbar' },
      hubButton(ctx),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Aide tools'),
      h('p', { class: 'day' }, '')),
    h('div', { class: 'card aide-card' },
      h('section', {},
        h('h2', {}, 'Read aloud in studies'), aloud,
        h('p', { class: 'muted' }, 'Off by default: the text is shown large, and the aide reads it or everyone reads along. '
          + 'Turn it on to have this device read Scripture, prayers and notes with its built-in voice. '
          + 'You can also switch it in any study, at the top of the screen.')),
      h('section', {},
        h('h2', {}, 'Reading speed'), speed),
      h('section', {},
        h('h2', {}, 'Music volume'), volume),
      h('section', {},
        h('h2', {}, 'Voice'),
        h('div', { class: 'choice-row' }, voiceSelect, testVoice),
        voices.length ? null : h('p', { class: 'muted' }, 'This browser has no voices installed for reading aloud.')),
      h('section', {},
        h('h2', {}, 'Show AI reasoning'), reasons,
        h('p', { class: 'muted' }, 'Shows why each “Added for you” part and “Picked for you” game was chosen. '
          + 'The AI only picks from published hymns, prayers and Bible passages; it never writes them.')),
      h('section', {},
        h('h2', {}, 'Notes'), resetBtn, notesStatus,
        h('p', { class: 'muted' }, 'Notes stay on this device. No names are saved.')))));
  drawAloud();
  drawReasons();
  drawSpeed();
  return () => speaker.stop();
}
