// Aide tools: reading speed, music volume, voice; reset notes.
// Everything is saved on this tablet only (localStorage). No names are saved.
import { RATES } from '../speech.js';
import { confirmDialog, h, icon } from '../ui.js';

const RATE_LABEL = { slower: 'Slower', slow: 'Slow', normal: 'Normal' };

export async function render(root, _params, ctx) {
  const { store, speaker, audio } = ctx;
  const settings = store.settings();
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
      if (await confirmDialog('Reset all notes on this tablet? “Enjoyed” and “Skip” marks on hymns and studies will be cleared.', { yes: 'Reset notes' })) {
        store.resetNotes();
        notesStatus.textContent = 'Notes were reset.';
      }
    },
  }, 'Reset notes…');

  root.append(h('div', { class: 'screen aide' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Aide tools'),
      h('p', { class: 'day' }, '')),
    h('div', { class: 'card aide-card' },
      h('section', {},
        h('h2', {}, 'Reading speed'), speed),
      h('section', {},
        h('h2', {}, 'Music volume'), volume),
      h('section', {},
        h('h2', {}, 'Voice'),
        h('div', { class: 'choice-row' }, voiceSelect, testVoice),
        voices.length ? null : h('p', { class: 'muted' }, 'This browser has no voices installed for reading aloud.')),
      h('section', {},
        h('h2', {}, 'Notes'), resetBtn, notesStatus,
        h('p', { class: 'muted' }, 'Notes stay on this tablet. No names are saved.')))));
  drawSpeed();
  return () => speaker.stop();
}
