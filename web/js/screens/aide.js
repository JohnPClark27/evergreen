// Aide tools: choose a day, reading speed, music volume, voice; reset hymn notes.
// Everything is saved on this tablet only (localStorage). No names are saved.
import * as api from '../api.js';
import { RATES } from '../speech.js';
import { confirmDialog, h, icon } from '../ui.js';

const RATE_LABEL = { slower: 'Slower', slow: 'Slow', normal: 'Normal' };

export async function render(root, _params, ctx) {
  const { store, speaker, audio } = ctx;
  const settings = store.settings();
  const plans = await api.getPlans();
  const progress = store.progress();
  let plan = plans.find((p) => p.id === progress.planId) ?? plans[0];
  let chosenDay = plan && progress.planId === plan.id ? progress.currentDay : 1;

  // ---- Day picker ----
  const dayGrid = h('div', { class: 'day-grid', role: 'radiogroup', 'aria-label': 'Day' });
  const startBtn = h('button', { class: 'pill primary big', type: 'button' });
  function drawDays() {
    if (!plan) { dayGrid.replaceChildren(h('p', { class: 'muted' }, 'No published plan yet.')); startBtn.disabled = true; return; }
    dayGrid.replaceChildren(...plan.days.map((d) => h('button', {
      class: `day-btn${d.day_number === chosenDay ? ' selected' : ''}`, type: 'button', role: 'radio',
      'aria-checked': String(d.day_number === chosenDay), 'aria-label': `Day ${d.day_number}: ${d.study.hymn.title}`,
      title: d.study.title,
      onclick: () => { chosenDay = d.day_number; drawDays(); },
    }, String(d.day_number))));
    startBtn.textContent = `Start Day ${chosenDay}`;
  }
  startBtn.addEventListener('click', async () => {
    store.startDay(plan.id, chosenDay);
    await ctx.unlock();
    ctx.go('#/session');
  });
  const planPicker = plans.length > 1 && h('select', {
    class: 'select', 'aria-label': 'Plan',
    onchange: (e) => { plan = plans.find((p) => String(p.id) === e.target.value); chosenDay = 1; drawDays(); },
  }, plans.map((p) => h('option', { value: p.id, selected: p.id === plan?.id }, p.title)));

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
      if (await confirmDialog('Reset all hymn notes on this tablet? “Enjoyed” and “Skip” marks will be cleared.', { yes: 'Reset notes' })) {
        store.resetNotes();
        notesStatus.textContent = 'Hymn notes were reset.';
      }
    },
  }, 'Reset hymn notes…');

  root.append(h('div', { class: 'screen aide' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Aide tools'),
      h('p', { class: 'day' }, '')),
    h('div', { class: 'card aide-card' },
      h('section', {},
        h('h2', {}, 'Choose a day'),
        planPicker, dayGrid, startBtn),
      h('section', {},
        h('h2', {}, 'Reading speed'), speed),
      h('section', {},
        h('h2', {}, 'Music volume'), volume),
      h('section', {},
        h('h2', {}, 'Voice'),
        h('div', { class: 'choice-row' }, voiceSelect, testVoice),
        voices.length ? null : h('p', { class: 'muted' }, 'This browser has no voices installed for reading aloud.')),
      h('section', {},
        h('h2', {}, 'Hymn notes'), resetBtn, notesStatus,
        h('p', { class: 'muted' }, 'Notes stay on this tablet. No names are saved.')))));
  drawDays();
  drawSpeed();
  return () => speaker.stop();
}
