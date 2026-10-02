// Session: Hymn -> Scripture -> Prayer for today's day of the published plan.
//
// Layout (docs/PLAN_PROMPT.md section 4):
//   top bar     Home · step tracker (1 Hymn → 2 Scripture → 3 Prayer, ✓ when done) · "Day N of M"
//   card        the hymn words / Scripture / prayer, current word/verse/line highlighted
//   bottom bar  Back · Sing/Read again · big round Pause · Next
// The aide moves between steps with Next/Back: nothing advances on its own, and nothing
// changes music on scroll.
import * as api from '../api.js';
import { refLabel } from '../books.js';
import { hymnPanel } from '../hymn-panel.js';
import { splitLines } from '../speech.js';
import { bringIntoView, h, icon } from '../ui.js';

const STEPS = ['Hymn', 'Scripture', 'Prayer'];
const RATE_LABEL = { slower: 'Slower', slow: 'Slow', normal: 'Normal' };

/** Pick the plan and day from saved progress (or ?day=N from Aide tools). */
async function today(store, params) {
  const plans = await api.getPlans();
  const plan = plans.find((x) => x.id === store.progress().planId) ?? plans[0];
  if (!plan || !plan.days.length) return null;
  if (params.day) store.startDay(plan.id, Number(params.day));
  const p = store.progress();
  const day = Math.min(Math.max(1, p.planId === plan.id ? p.currentDay : 1), plan.days.length);
  if (p.planId !== plan.id) store.startDay(plan.id, day);
  return { plan, day, study: plan.days[day - 1].study };
}

/** "Based on …": the hymn's own scripture ref that covers today's passage, else its first ref. */
async function basedOn(hymn, study) {
  const refs = await api.getHymnRefs(hymn.id).catch(() => []);
  const same = refs.find((r) => r.book === study.book && r.chapter === study.chapter);
  const r = same ?? refs[0];
  return r ? refLabel(r.book, r.chapter, r.verse_start, r.verse_end) : null;
}

export async function render(root, params, ctx) {
  const { audio, speaker, store } = ctx;
  const t = await today(store, params);
  if (!t) {
    root.append(h('div', { class: 'screen message' },
      h('p', { class: 'big-text' }, 'There is no session ready yet.'),
      h('p', { class: 'muted' }, 'A plan needs to be published first.'),
      h('button', { class: 'pill primary', onclick: () => ctx.go('#/') }, 'Go Home')));
    return null;
  }
  const { plan, day, study } = t;
  const { hymn, prayer } = study;
  const saved = store.sessionStep();
  let step = saved.planId === plan.id && saved.day === day ? Math.min(2, saved.step) : 0;
  let stepToken = 0; // bumps when the step changes, so late async work is ignored

  // ---------- frame ----------
  const tracker = h('ol', { class: 'steps', 'aria-label': 'Session steps' });
  const card = h('section', { class: 'card', 'aria-live': 'off' });
  const againBtn = h('button', { class: 'pill', type: 'button' }, icon('again'), h('span', { class: 'label' }, 'Sing again'));
  const pauseBtn = h('button', { class: 'round', type: 'button', 'aria-label': 'Pause' }, icon('pause'));
  const backBtn = h('button', { class: 'pill', type: 'button' }, icon('back'), h('span', { class: 'label' }, 'Back'));
  const nextBtn = h('button', { class: 'pill primary', type: 'button' }, h('span', { class: 'label' }, 'Next'), icon('next'));

  root.append(h('div', { class: 'screen session' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      tracker,
      h('p', { class: 'day' }, `Day ${day} of ${plan.days.length}`)),
    card,
    h('footer', { class: 'bottombar' }, backBtn, againBtn, pauseBtn, nextBtn)));

  function drawTracker() {
    tracker.replaceChildren(...STEPS.map((name, i) => h('li', {
      class: i === step ? 'current' : i < step ? 'done' : '',
      'aria-current': i === step ? 'step' : null,
    }, h('span', { class: 'step-pill' }, i < step ? icon('check') : h('span', { class: 'num' }, `${i + 1}`), ` ${name}`))));
  }

  // ---------- pause / play ----------
  let paused = false;
  function setPaused(p) {
    paused = p;
    pauseBtn.replaceChildren(icon(p ? 'play' : 'pause'));
    pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
    pauseBtn.classList.toggle('is-paused', p);
  }
  pauseBtn.addEventListener('click', async () => {
    if (!paused) {
      speaker.pause();
      await audio.pause();
      setPaused(true);
    } else {
      setPaused(false);
      if (audio.currentUrl) await audio.resume();
      if (speaker.state === 'paused') speaker.resume();
      else if (step === 0 && !audio.currentUrl) panel?.restart(); // the hymn had ended
    }
  });

  // ---------- steps ----------
  let panel = null;

  async function showHymn(token) {
    againBtn.querySelector('.label').textContent = 'Sing again';
    panel = hymnPanel(ctx, hymn, { basedOn: null });
    card.replaceChildren(panel.el);
    basedOn(hymn, study).then((label) => {
      if (label && token === stepToken) panel.el.querySelector('.title').after(h('p', { class: 'muted' }, `Based on ${label}`));
    });
    if (!paused) await panel.start({ loop: false });
  }

  async function readAloud(token, title, lines, { badge, footer, centered = false }) {
    againBtn.querySelector('.label').textContent = 'Read again';
    const items = lines.map((line) => (typeof line === 'string'
      ? h('p', { class: 'read-line' }, line)
      : h('p', { class: 'read-line' }, h('sup', { class: 'vnum' }, String(line.num)), ' ', line.text)));
    card.replaceChildren(h('div', { class: `reading-panel${centered ? ' centered' : ''}` },
      h('h2', { class: 'title' }, title),
      badge && h('p', { class: 'badge' }, badge),
      h('div', { class: 'read-lines' }, items),
      footer && h('p', { class: 'muted small attribution' }, footer)));
    // Soft music underneath: keep the hymn going (looped); speech lowers it while reading.
    if (panel?.url && !paused) {
      if (audio.currentUrl === panel.url) audio.setLoop(true);
      else await audio.play(panel.url, { loop: true, fade: 2 }).catch(() => {});
    }
    const onSegment = (e) => {
      items.forEach((p, i) => p.classList.toggle('reading', i === e.detail.index));
      bringIntoView(items[e.detail.index]);
    };
    const onEnd = () => items.forEach((p) => p.classList.remove('reading'));
    speaker.addEventListener('segment', onSegment);
    speaker.addEventListener('end', onEnd);
    cleanups.push(() => { speaker.removeEventListener('segment', onSegment); speaker.removeEventListener('end', onEnd); });
    if (token !== stepToken || paused) return;
    if (typeof lines[0] === 'string') speaker.speakText(lines.join('\n')).catch(() => {});
    else speaker.speakVerses(lines).catch(() => {});
  }

  async function showScripture(token) {
    const ref = refLabel(study.book, study.chapter, study.verse_start, study.verse_end);
    card.replaceChildren(h('p', { class: 'muted big-text' }, `Opening ${ref}…`));
    let passage;
    try {
      passage = await api.getPassage(study.book, study.chapter, study.verse_start, study.verse_end);
    } catch (err) {
      card.replaceChildren(h('p', { class: 'big-text' }, `${ref}`), h('p', { class: 'muted' }, `The Scripture could not be loaded. ${err.message}`));
      return;
    }
    if (token !== stepToken) return;
    await readAloud(token, passage.reference, passage.verses, {
      badge: `Reading aloud · ${RATE_LABEL[speaker.rateName] ?? 'Slow'}`,
      footer: passage.attribution,
    });
  }

  async function showPrayer(token) {
    await readAloud(token, prayer.title, splitLines(prayer.text), {
      footer: prayer.attribution ?? prayer.source, centered: true,
    });
  }

  let cleanups = [];
  async function go(to) {
    const token = ++stepToken;
    cleanups.forEach((f) => f());
    cleanups = [];
    speaker.stop();
    step = to;
    store.setSessionStep({ planId: plan.id, day, step });
    drawTracker();
    backBtn.disabled = step === 0;
    nextBtn.querySelector('.label').textContent = step === 2 ? 'Finish' : 'Next';
    card.scrollTop = 0;
    if (step === 0) { audio.stop(0.8); await showHymn(token); }
    else if (step === 1) await showScripture(token);
    else await showPrayer(token);
    card.focus({ preventScroll: true });
  }

  againBtn.addEventListener('click', () => {
    setPaused(false);
    if (step === 0) panel?.restart();
    else { if (audio.currentUrl) audio.resume(); speaker.repeat().catch(() => {}); }
  });
  backBtn.addEventListener('click', () => { if (step > 0) go(step - 1); });
  nextBtn.addEventListener('click', () => {
    if (step < 2) { go(step + 1); return; }
    store.completeDay(plan.id, day, plan.days.length, hymn.number);
    ctx.go('#/done');
  });
  // When the hymn finishes on step 1, point the aide at "Next".
  const onEnded = () => { if (step === 0) nextBtn.classList.add('attention'); };
  audio.addEventListener('ended', onEnded);
  nextBtn.addEventListener('click', () => nextBtn.classList.remove('attention'));

  card.setAttribute('tabindex', '-1');
  setPaused(false);
  // The hymn panel needs to exist for "music under the reading", even when resuming at step 2/3.
  if (step > 0) panel = hymnPanel(ctx, hymn);
  await go(step);

  return () => {
    stepToken++;
    cleanups.forEach((f) => f());
    audio.removeEventListener('ended', onEnded);
    panel?.stop();
    speaker.stop();
    audio.stop(1);
  };
}

