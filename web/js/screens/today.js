// For you (#/today?mood=N): after "How are you feeling today?". A verse of the day chosen
// for that answer, four things to do around it (a hymn, a prayer, a game, the chapter...),
// and "Engage further" for everything else (#/explore). Laid out for older eyes: the verse
// in large print across the top, then four big one-word buttons, then Engage further.
//
// The curate function ("today") chooses the verse (step-by-step prompt, guided by example
// passages) and four activities: any mix of hymns, prayers, reading and games, a kind may
// repeat if the items differ. Only the mood number goes with it (no names). If the AI is
// slow (13 s) or down, a random example verse and a varied mix are used instead.
// The answer is kept for this visit only (sessionStorage). Verse text is fetched live and
// never saved.
import * as api from '../api.js';
import { setHub } from '../nav.js';
import { refLabel } from '../books.js';
import { GAME_TYPES } from '../curate.js';
import { engagement, parseRefKey, refKey } from '../engagement.js';
import { gameHash } from '../game-link.js';
import { moduleFor } from '../../modules/index.js';
import { faceSvg, moodFor, MOOD_EXAMPLES, savedMood } from '../mood.js';
import { seeded } from '../../modules/game-common.js';
import { aiMark, h, icon, loading, readAloudButton } from '../ui.js';

/** Fallback verse of the day: one of the mood's examples, the same one all day. */
function placeholderVerse(level) {
  const list = MOOD_EXAMPLES[level] ?? MOOD_EXAMPLES[3];
  const rnd = seeded(`${new Date().toLocaleDateString('en-CA')}|${level}`);
  const [book, chapter, start, end] = list[Math.floor(rnd() * list.length)];
  return { book, chapter, start, end };
}

/** Fit the verse in its box: shrink the text toward the 28px minimum; if it still doesn't
 * fit, show a visible "More below" cue (older readers may not think to scroll). */
function fitVerse(box) {
  if (!box) return;
  const lines = [...box.querySelectorAll('.read-line')];
  for (let px = 30; px >= 28 && box.scrollHeight > box.clientHeight + 2; px--) {
    for (const l of lines) l.style.fontSize = `${px}px`;
  }
  if (box.scrollHeight > box.clientHeight + 2) {
    const cue = h('p', { class: 'more-below', 'aria-hidden': 'true' }, 'More below ↓');
    box.append(cue);
    box.addEventListener('scroll', () => { cue.hidden = box.scrollTop + box.clientHeight >= box.scrollHeight - 4; });
  }
}

export async function render(root, params, ctx) {
  const mood = moodFor(params.mood) ?? savedMood();
  if (!mood) { ctx.go('#/'); return null; }
  setHub('myday'); // screens opened from here come back with "My Day"
  root.append(loading('Choosing something for you…'));

  const catalog = await api.getCatalog().catch(() => ({ hymns: [], prayers: [], refs: [] }));
  const choice = await chooseForYou(mood.level, catalog);
  const ref = choice.verse;
  const label = refLabel(ref.book, ref.chapter, ref.start, ref.end);
  const here = `#/today?mood=${mood.level}`;
  const passage = await api.getPassage(ref.book, ref.chapter, ref.start, ref.end).catch(() => null);
  const showReasons = ctx.store.settings().showReasons === true;
  const verseEls = (passage?.verses ?? []).map((v) => h('p', { class: 'read-line' }, h('sup', { class: 'vnum' }, String(v.num)), ' ', v.text));

  // Each button leads with ONE big word (Hymn, Game, Prayer, Read); the detail is smaller.
  const picks = choice.picks.map((p) => button(p, catalog, ref, here)).filter(Boolean);
  const open = (p) => async () => {
    engagement.record(p.type, p.config, 'opened');
    await ctx.unlock();
    ctx.go(p.go);
  };

  const face = h('span', { class: 'mood-face small', 'aria-hidden': 'true' });
  face.innerHTML = faceSvg(mood);
  root.replaceChildren(h('div', { class: 'screen today' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/?ask=1') }, icon('back'), h('span', { class: 'label' }, 'Start over')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'My Day'),
      h('p', { class: 'day mood-chip' }, face, mood.label)),
    // Top: the verse of the day across the screen. Bottom: four big buttons, then Engage further.
    h('section', { class: 'card verse-day', tabindex: '0', 'aria-label': `Verse of the day: ${label}` },
      h('div', { class: 'verse-head' },
        h('p', { class: 'tag added' }, icon('sparkle'), 'Verse of the day'),
        h('h2', { class: 'title' }, passage?.reference ?? label),
        passage && readAloudButton(ctx.speaker, () => passage.verses, { items: verseEls }),
        aiMark(choice.source),
        showReasons && h('span', { class: 'reason' }, `${choice.source === 'ai' ? 'Chosen by AI' : 'Example passage (AI unavailable)'}${choice.verseReason ? `: ${choice.verseReason}` : ''}`)),
      passage
        ? h('div', { class: 'read-lines' }, verseEls)
        : h('p', { class: 'big-text' }, 'The verse could not be loaded right now.'),
      passage && h('p', { class: 'muted small attribution' }, passage.attribution)),
    h('div', { class: 'today-picks', role: 'group', 'aria-label': 'Four things for you' },
      picks.map((p) => h('button', { class: 'pick-tile', type: 'button', onclick: open(p) },
        h('span', { class: 'pick-word' }, icon(p.icon), p.word),
        h('span', { class: 'pick-detail' }, p.detail),
        showReasons && p.reason && h('span', { class: 'reason' }, `Why: ${p.reason}`)))),
    h('button', { class: 'pill primary big engage', type: 'button', onclick: () => ctx.go('#/explore') },
      h('span', { class: 'label' }, 'Engage further'), icon('next'))));
  fitVerse(root.querySelector('.verse-day'));
  return () => ctx.speaker.stop();
}

/**
 * Ask the curate function for today's verse and four picks (once per mood per visit).
 * -> { verse: {book, chapter, start, end}, verseReason, picks: [{ module_type, id_or_ref, reason }], source }
 */
async function chooseForYou(level, catalog) {
  const key = `hr.today.${level}`;
  try { const hit = JSON.parse(sessionStorage.getItem(key)); if (hit?.verse) return hit; } catch { /* ask */ }
  let result = null;
  try {
    const res = await api.callCurate({
      action: 'today', mood: level,
      history: engagement.summary(catalog.hymns),
      catalog: { hymns: catalog.hymns.map((x) => x.id), prayers: catalog.prayers.map((x) => x.id), refs: catalog.refs.map(refKey) },
    }, 13000); // step-by-step thinking (up to 9 s) + the verse check; the spinner shows meanwhile
    const verse = parseRefKey(res?.verse?.ref);
    if (verse) result = { verse, verseReason: res.verse.reason ?? '', picks: res.picks ?? [], source: res.source };
  } catch (err) {
    console.info('today: using the fallback', err.message);
  }
  result ??= fallbackChoice(level, catalog);
  try { sessionStorage.setItem(key, JSON.stringify(result)); } catch { /* fine */ }
  return result;
}

/** No AI: an example verse for the feeling, and a hymn, a game, a prayer and the chapter. */
function fallbackChoice(level, catalog) {
  const verse = placeholderVerse(level);
  const rnd = seeded(`${refKey(verse)}|picks`);
  const any = (list) => list[Math.floor(rnd() * list.length)];
  const game = any(GAME_TYPES);
  return {
    verse, verseReason: '', source: 'fallback',
    picks: [
      catalog.hymns.length && { module_type: 'hymn', id_or_ref: String(any(catalog.hymns).id) },
      { module_type: game, id_or_ref: refKey(verse) },
      catalog.prayers.length && { module_type: 'prayer', id_or_ref: String(any(catalog.prayers).id) },
      { module_type: 'read', id_or_ref: refKey(verse) },
    ].filter(Boolean),
  };
}

/** One pick -> a big button's word, icon, detail and destination (null if it can't be shown). */
function button(p, catalog, verse, here) {
  const id = String(p.id_or_ref);
  if (p.module_type === 'hymn') {
    const hymn = catalog.hymns.find((x) => String(x.id) === id);
    return hymn && { word: 'Hymn', icon: 'music', detail: `Sing “${hymn.title}”`, go: `#/sing/${hymn.number}`,
      type: 'hymn', config: { hymn_id: hymn.id }, reason: p.reason };
  }
  if (p.module_type === 'prayer') {
    const prayer = catalog.prayers.find((x) => String(x.id) === id);
    return prayer && { word: 'Prayer', icon: 'sparkle', detail: prayer.title, go: `#/prayers/${prayer.id}`,
      type: 'prayer', config: { prayer_id: prayer.id }, reason: p.reason };
  }
  const ref = parseRefKey(id) ?? verse;
  if (p.module_type === 'read') {
    return { word: 'Read', icon: 'book', detail: `All of ${refLabel(ref.book, ref.chapter)}, in large print`,
      go: `#/read?book=${ref.book}&chapter=${ref.chapter}`, type: 'scripture', config: ref, reason: p.reason };
  }
  if (GAME_TYPES.includes(p.module_type)) {
    return { word: 'Game', icon: 'game', detail: `${moduleFor(p.module_type).name} on ${refLabel(ref.book, ref.chapter, ref.start, ref.end)}`,
      go: gameHash(p.module_type, { ref }, here), type: p.module_type, config: ref, reason: p.reason };
  }
  return null;
}
