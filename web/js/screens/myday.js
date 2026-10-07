// My Day (#/myday): today's study from the pastor's plan, with a few parts "Added for you".
//
//   - The human study comes first and stays in its order: the next unfinished study of the
//     plan this tablet used last (or the first plan).
//   - Suggestions (curate.js) are slotted in after a part they relate to and marked
//     "Added for you", each with 👍 / 👎. 👎 ("Skip next time") is never suggested again.
//   - A first-time tablet gets one of each kind of part ("Trying something new"). No questions.
//   - #/myday/play plays the whole day in the study runner; Finish ticks the human study.
// Today's list is kept in sessionStorage so the list and the player show the same parts.
import * as api from '../api.js';
import { nextStudy } from '../plan-progress.js';
import { clearCurateCache, curate } from '../curate.js';
import { engagement } from '../engagement.js';
import { gameTarget, openGameFor } from '../game-link.js';
import { runStudy } from '../runner.js';
import { moduleFor } from '../../modules/index.js';
import { h, icon, loading, thumbButtons } from '../ui.js';

const DAY_KEY = 'hr.myDay'; // sessionStorage: { key, suggestions }

function readDay() { try { return JSON.parse(sessionStorage.getItem(DAY_KEY)); } catch { return null; } }
function writeDay(v) { try { sessionStorage.setItem(DAY_KEY, JSON.stringify(v)); } catch { /* fine */ } }
export function clearDay() { try { sessionStorage.removeItem(DAY_KEY); } catch { /* fine */ } }

/** Which plan and study today is: the plan used last, else the first one with studies. */
async function todaysStudy(store) {
  const plans = (await api.getStudyPlans()).filter((p) => p.studies.some((s) => s.items.length));
  const step = store.studyStep().planId;
  const lastId = (typeof step === 'number' ? step : null) ?? store.lastStudy().planId;
  const chosen = plans.find((p) => p.id === lastId) ?? plans[0];
  if (!chosen) return { plan: null, study: null };
  const plan = await api.getStudyPlan(chosen.id);
  const study = nextStudy(plan, store.planProgress(plan.id)) ?? plan.studies.find((s) => s.items.length);
  return { plan, study };
}

/** Put each suggestion after a part it relates to: a game after its passage, the rest
 * before the study's last part (usually its closing prayer or hymn). */
function merge(human, suggestions) {
  const items = human.map((x) => ({ ...x }));
  for (const s of suggestions) {
    const item = { module_type: s.module_type, config: s.config, suggested: true, reason: s.reason };
    const ref = gameTarget(item).ref;
    let at = ref ? items.findIndex((x) => x.module_type === 'scripture' && x.config?.book === ref.book && x.config?.chapter === ref.chapter) : -1;
    if (at >= 0) at += 1;
    else at = Math.max(0, items.length - 1);
    items.splice(at, 0, item);
  }
  return items;
}

/** Today's plan, study and merged parts. `fresh` asks for new suggestions. */
async function buildDay(ctx, fresh = false) {
  const { plan, study } = await todaysStudy(ctx.store);
  const key = `${plan?.id ?? 0}:${study?.key ?? ''}`;
  let day = readDay();
  if (fresh || !day || day.key !== key) {
    const isNew = engagement.isNew();
    const { suggestions, source } = await curate('my_day', { current: studyContext(study), fresh });
    day = { key, suggestions, source, isNew };
    writeDay(day);
  }
  // Anything marked "Skip next time" since the list was made drops out at once.
  const suggestions = day.suggestions.filter((s) => !engagement.skipped(s.module_type, s.config));
  return { plan, study, day, items: merge(study?.items ?? [], suggestions) };
}

/** What today's study is about (sent with the curate call): its first passage and hymn. */
function studyContext(study) {
  const items = study?.items ?? [];
  const sc = items.find((x) => x.module_type === 'scripture')?.config;
  const hy = items.find((x) => x.module_type === 'hymn')?.config;
  return { ref: sc ? { book: sc.book, chapter: sc.chapter, start: sc.start, end: sc.end } : undefined, hymn_id: hy?.hymn_id };
}

export async function render(root, params, ctx) {
  return params.arg === 'play' ? play(root, ctx) : list(root, ctx, params.fresh === '1');
}

async function list(root, ctx, fresh) {
  const showReasons = ctx.store.settings().showReasons === true;
  // A calm spinner while today is put together (the AI gets at most 5 s, then the fallback).
  root.append(loading('Getting your day ready…'));
  const [{ plan, study, day, items }, catalog] = await Promise.all([buildDay(ctx, fresh), api.getCatalog()]);
  root.replaceChildren();
  const lib = {
    hymns: catalog.hymns, prayers: catalog.prayers,
    hymn: (id) => catalog.hymns.find((x) => x.id === Number(id)),
    prayer: (id) => catalog.prayers.find((x) => x.id === Number(id)),
  };

  const start = async () => { await ctx.unlock(); ctx.go('#/myday/play'); };
  const rows = items.map((it, i) => {
    const mod = moduleFor(it.module_type);
    let summary = '';
    try { summary = mod?.summary?.(it.config ?? {}, lib) ?? ''; } catch { /* a part we can't describe */ }
    const hymn = it.module_type === 'hymn' ? lib.hymn(it.config.hymn_id) : null;
    const status = h('span', { class: 'muted small', 'aria-live': 'polite' });
    return h('li', { class: `day-row${it.suggested ? ' suggested' : ''}` },
      h('span', { class: 'study-num', 'aria-hidden': 'true' }, String(i + 1)),
      h('span', { class: 'study-row-text' },
        h('span', { class: 'study-row-title' }, mod?.name ?? 'Part'),
        summary && h('span', { class: 'study-row-meta' }, summary),
        it.suggested && showReasons && it.reason && h('span', { class: 'reason' }, `Why: ${it.reason}`)),
      it.suggested && h('span', { class: 'day-row-side' },
        h('span', { class: 'tag added' }, icon('sparkle'), 'Added for you'),
        thumbButtons(engagement.noteFor(it.module_type, it.config), (kind) => {
          engagement.note(it.module_type, it.config, kind, hymn?.number);
          status.textContent = kind === 'enjoyed' ? 'Noted: more like this.' : 'Noted: not suggested again.';
        }, `Notes for ${mod?.name ?? 'this part'}: ${summary}`),
        status));
  });

  const welcome = day.isNew
    ? 'Welcome! Here is a study to begin with, and a few things to try.'
    : study ? `From “${plan.title}”: Study ${study.position + 1}, ${study.title}.` : 'Here are a few things to try today.';

  root.append(h('div', { class: 'screen sing plan myday' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'My Day'),
      h('p', { class: 'day' }, `${items.length} parts`)),
    h('section', { class: 'card plan-card', tabindex: '0', 'aria-label': 'Today’s parts' },
      h('p', { class: 'plan-desc' }, welcome),
      items.length
        ? h('button', { class: 'pill primary big continue', type: 'button', onclick: start },
          h('span', { class: 'label' }, 'Start My Day'), icon('next'))
        : h('p', { class: 'big-text' }, 'Nothing is ready yet.'),
      h('ol', { class: 'study-list' }, rows),
      h('div', { class: 'row' },
        h('button', { class: 'pill', type: 'button', onclick: () => ctx.go(`#/myday?fresh=1&r=${Date.now()}`) },
          icon('again'), h('span', { class: 'label' }, 'New suggestions')),
        h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/studies') },
          h('span', { class: 'label' }, 'Choose a study plan'))))));
  return null;
}

async function play(root, ctx) {
  const { plan, study, items } = await buildDay(ctx);
  if (!items.length) { ctx.go('#/myday'); return null; }
  const saved = ctx.store.studyStep();
  const resume = saved.planId === 'myday';
  return runStudy(root, { title: 'My Day', subtitle: study ? study.title : 'My Day', items }, ctx, {
    startAt: resume ? saved.index : 0,
    exitLabel: 'My Day',
    onStep: (index) => ctx.store.setStudyStep({ planId: 'myday', studyKey: study?.key ?? null, index }),
    onExit: () => { ctx.store.clearStudyStep(); ctx.go('#/myday'); },
    onGame: (item, all, btn) => openGameFor(ctx, item, all, '#/myday/play', btn),
    onFinish: () => {
      for (const it of items) engagement.record(it.module_type, it.config, 'finished');
      clearDay();
      clearCurateCache(); // the next My Day asks again, with what was just done
      if (plan && study) ctx.store.finishStudy(plan.id, plan.title, study.key, study.title);
      else ctx.store.clearStudyStep();
      ctx.go('#/done');
    },
  });
}
