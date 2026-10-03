// runner.js - plays a study plan: its modules one after another, each in the big card.
//
//   top bar     Home (or Close) · "Part 2 of 6 · Scripture" · progress bar
//   card        whatever the current module draws (web/modules/*.js → play())
//   bottom bar  Back · Again (the module's label) · round Pause · Next / Finish
//
// The aide moves with Back/Next; nothing advances on its own. A hymn sung just before keeps
// playing softly under modules that allow it (musicBed), and speech lowers it further.
// Used by the tablet (#/study/<id>) and the Studio's preview, so authors see the real thing.
import * as api from './api.js';
import { moduleFor } from '../modules/index.js';
import { h, icon } from './ui.js';

/**
 * plan: { id, title, subtitle?, items: [{ module_type, config }] }  (one study: its modules in order)
 * ctx:  { audio, speaker } (+ store, for resuming)
 * opts: { onExit(), onFinish(), exitLabel, startAt, onStep(index) }
 * Returns a cleanup function.
 */
export async function runStudy(root, plan, ctx, opts = {}) {
  const { audio, speaker } = ctx;
  const items = plan.items ?? [];
  let index = Math.min(Math.max(0, opts.startAt ?? 0), Math.max(0, items.length - 1));
  let controller = null;
  let paused = false;
  let musicUrl = null; // the last hymn played: kept softly under later modules
  let token = 0;       // bumps on every step change so late async work is ignored

  const kit = { audio, speaker, api, paused: () => paused };
  // Read-aloud: off unless the aide turned it on (saved on this tablet). Restored on exit so
  // Read the Bible's own "Read aloud" button and Aide tools' "Test voice" are unaffected.
  let readAloud = ctx.store?.settings().readAloud === true;
  speaker.enabled = readAloud;

  // ---------- frame ----------
  const where = h('p', { class: 'where', 'aria-live': 'polite' });
  const bar = h('div', { class: 'progress', 'aria-hidden': 'true' });
  const stage = h('section', { class: 'card', tabindex: '0', 'aria-label': plan.title });
  // (plan.subtitle, e.g. "Study 3 of 12", is shown top right when the study is part of a plan)
  const againBtn = h('button', { class: 'pill', type: 'button' }, icon('again'), h('span', { class: 'label' }, 'Again'));
  const pauseBtn = h('button', { class: 'round', type: 'button', 'aria-label': 'Pause' }, icon('pause'));
  const backBtn = h('button', { class: 'pill', type: 'button' }, icon('back'), h('span', { class: 'label' }, 'Back'));
  const nextBtn = h('button', { class: 'pill primary', type: 'button' }, h('span', { class: 'label' }, 'Next'), icon('next'));
  const voiceBtn = h('button', { class: 'pill voice-toggle', type: 'button', 'aria-pressed': 'false' });
  const drawVoice = () => {
    voiceBtn.textContent = `Read aloud: ${readAloud ? 'On' : 'Off'}`;
    voiceBtn.setAttribute('aria-pressed', String(readAloud));
    voiceBtn.classList.toggle('on', readAloud);
  };
  const refreshAgain = () => {
    againBtn.disabled = !controller?.again || (controller.needsSpeech && !readAloud);
  };

  root.append(h('div', { class: 'screen session' },
    h('h1', { class: 'sr-only', tabindex: '-1' }, plan.title),
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => opts.onExit?.() },
        icon(opts.exitLabel ? 'back' : 'home'), h('span', { class: 'label' }, opts.exitLabel ?? 'Home')),
      h('div', { class: 'where-box' }, where, bar),
      voiceBtn,
      h('p', { class: 'day plan-name' }, plan.subtitle ?? plan.title)),
    stage,
    h('footer', { class: 'bottombar' }, backBtn, againBtn, pauseBtn, nextBtn)));

  function setPaused(p) {
    paused = p;
    pauseBtn.replaceChildren(icon(p ? 'play' : 'pause'));
    pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
    pauseBtn.classList.toggle('is-paused', p);
  }

  // ---------- steps ----------
  async function show(i) {
    const t = ++token;
    try { controller?.stop?.(); } catch (err) { console.error(err); }
    controller = null;
    speaker.stop();
    nextBtn.classList.remove('attention');
    index = i;
    opts.onStep?.(index);

    const item = items[index];
    const mod = item && moduleFor(item.module_type);
    where.textContent = items.length ? `Part ${index + 1} of ${items.length} · ${mod?.name ?? 'Part'}` : '';
    bar.replaceChildren(...items.map((_, k) => h('span', { class: k < index ? 'done' : k === index ? 'now' : '' })));
    backBtn.disabled = index === 0;
    nextBtn.querySelector('.label').textContent = index >= items.length - 1 ? 'Finish' : 'Next';
    stage.scrollTop = 0;

    if (!item) { stage.replaceChildren(h('p', { class: 'big-text muted' }, 'This study is empty.')); return; }
    if (!mod) {
      stage.replaceChildren(h('p', { class: 'big-text muted' }, 'This part can’t be shown on this tablet yet. Tap Next to continue.'));
      return;
    }

    // Music under this part: keep the last hymn going softly, or make room for new sound.
    if (mod.musicBed && musicUrl && !paused) {
      if (audio.currentUrl === musicUrl) audio.setLoop(true);
      else audio.play(musicUrl, { loop: true, fade: 2 }).catch(() => {});
    } else if (!mod.musicBed) {
      audio.stop(0.6);
    }

    againBtn.querySelector('.label').textContent = 'Again';
    let c;
    try {
      c = await mod.play(stage, item.config ?? {}, kit);
    } catch (err) {
      console.error(err);
      if (t === token) stage.replaceChildren(h('p', { class: 'big-text muted' }, `This part couldn’t be shown. ${err.message}`));
      return;
    }
    if (t !== token) { c?.stop?.(); return; } // the aide already moved on
    controller = c ?? null;
    if (controller?.musicUrl) musicUrl = controller.musicUrl;
    againBtn.querySelector('.label').textContent = controller?.againLabel ?? 'Again';
    refreshAgain();
    stage.focus({ preventScroll: true });
  }

  pauseBtn.addEventListener('click', async () => {
    if (!paused) {
      setPaused(true);
      controller?.pause?.();
      speaker.pause();
      await audio.pause();
    } else {
      setPaused(false);
      if (audio.currentUrl) await audio.resume();
      controller?.resume?.();
    }
  });
  againBtn.addEventListener('click', () => { setPaused(false); controller?.again?.(); });
  voiceBtn.addEventListener('click', () => {
    readAloud = !readAloud;
    speaker.enabled = readAloud;
    ctx.store?.setSettings({ readAloud });
    drawVoice();
    refreshAgain();
    if (!readAloud) speaker.stop();                       // stops at once; the music comes back up
    else if (!paused) controller?.speakNow?.();           // start reading this part now
  });
  backBtn.addEventListener('click', () => { if (index > 0) show(index - 1); });
  nextBtn.addEventListener('click', () => {
    if (index < items.length - 1) show(index + 1);
    else opts.onFinish?.();
  });
  const onEnded = () => nextBtn.classList.add('attention'); // a hymn finished: point at Next
  audio.addEventListener('ended', onEnded);

  setPaused(false);
  drawVoice();
  await show(index);

  return () => {
    token++;
    speaker.enabled = true;
    audio.removeEventListener('ended', onEnded);
    try { controller?.stop?.(); } catch (err) { console.error(err); }
    speaker.stop();
    audio.stop(1);
  };
}

/** Rough minutes for a plan (shown on the tablet's study cards). */
export function estimateMinutes(types) {
  const per = { hymn: 3, scripture: 1.5, prayer: 1, note: 1, quiz: 2, 'finish-line': 3 };
  return Math.max(1, Math.round(types.reduce((sum, t) => sum + (per[t] ?? 1.5), 0)));
}
