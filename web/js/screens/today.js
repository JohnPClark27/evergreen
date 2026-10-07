// For you (#/today?mood=N): after "How are you feeling today?". A verse of the day chosen
// for that answer, four things to do around it (a hymn, a prayer, a game, the chapter...),
// and "Engage further" for everything else (#/explore). Laid out for older eyes: the verse
// in large print across the top, then four big one-word buttons, then Engage further.
//
// UI STEP: the verse is a placeholder pick from the draft list in mood.js (same pick all
// day); the AI's choice comes next. Verse text is fetched live and never saved.
import * as api from '../api.js';
import { refLabel } from '../books.js';
import { gameHash } from '../game-link.js';
import { faceSvg, moodFor, MOOD_EXAMPLES, savedMood } from '../mood.js';
import { seeded } from '../../modules/game-common.js';
import { h, icon, loading } from '../ui.js';

/** Placeholder verse of the day: one of the mood's examples, the same one all day. */
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
  root.append(loading('Choosing something for you…'));

  const ref = placeholderVerse(mood.level);
  const label = refLabel(ref.book, ref.chapter, ref.start, ref.end);
  const here = `#/today?mood=${mood.level}`;
  const [passage, chapterHymns, catalog] = await Promise.all([
    api.getPassage(ref.book, ref.chapter, ref.start, ref.end).catch(() => null),
    api.getChapterHymns(ref.book, ref.chapter).catch(() => []),
    api.getCatalog().catch(() => ({ hymns: [], prayers: [] })),
  ]);
  const rnd = seeded(`${label}|picks`);
  const hymn = chapterHymns[0]?.hymn ?? catalog.hymns[Math.floor(rnd() * catalog.hymns.length)];
  const prayer = catalog.prayers[Math.floor(rnd() * catalog.prayers.length)];

  // Four recommendations, all around the verse (placeholder mix; the AI picks these next).
  // Each button leads with ONE big word (Hymn, Game, Prayer, Read); the detail is smaller.
  const picks = [
    hymn && { word: 'Hymn', icon: 'music', detail: `Sing “${hymn.title}”`, go: `#/sing/${hymn.number}` },
    { word: 'Game', icon: 'game', detail: `${mood.level <= 2 ? 'Word Search' : 'Bible Trivia'} on ${label}`, go: gameHash(mood.level <= 2 ? 'word-search' : 'trivia', { ref }, here) },
    prayer && { word: 'Prayer', icon: 'sparkle', detail: prayer.title, go: `#/prayers/${prayer.id}` },
    { word: 'Read', icon: 'book', detail: `All of ${refLabel(ref.book, ref.chapter)}, in large print`, go: `#/read?book=${ref.book}&chapter=${ref.chapter}` },
  ].filter(Boolean);
  const open = (hash) => async () => { await ctx.unlock(); ctx.go(hash); };

  const face = h('span', { class: 'mood-face small', 'aria-hidden': 'true' });
  face.innerHTML = faceSvg(mood);
  root.replaceChildren(h('div', { class: 'screen today' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/?ask=1') }, icon('back'), h('span', { class: 'label' }, 'Start over')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Chosen for you'),
      h('p', { class: 'day mood-chip' }, face, mood.label)),
    // Top: the verse of the day across the screen. Bottom: four big buttons, then Engage further.
    h('section', { class: 'card verse-day', tabindex: '0', 'aria-label': `Verse of the day: ${label}` },
      h('div', { class: 'verse-head' },
        h('p', { class: 'tag added' }, icon('sparkle'), 'Verse of the day'),
        h('h2', { class: 'title' }, passage?.reference ?? label)),
      passage
        ? h('div', { class: 'read-lines' }, passage.verses.map((v) => h('p', { class: 'read-line' }, h('sup', { class: 'vnum' }, String(v.num)), ' ', v.text)))
        : h('p', { class: 'big-text' }, 'The verse could not be loaded right now.'),
      passage && h('p', { class: 'muted small attribution' }, passage.attribution)),
    h('div', { class: 'today-picks', role: 'group', 'aria-label': 'Four things for you' },
      picks.map((p) => h('button', { class: 'pick-tile', type: 'button', onclick: open(p.go) },
        h('span', { class: 'pick-word' }, icon(p.icon), p.word),
        h('span', { class: 'pick-detail' }, p.detail)))),
    h('button', { class: 'pill primary big engage', type: 'button', onclick: () => ctx.go('#/explore') },
      h('span', { class: 'label' }, 'Engage further'), icon('next'))));
  fitVerse(root.querySelector('.verse-day'));
  return null;
}
