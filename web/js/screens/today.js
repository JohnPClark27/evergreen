// For you (#/today?mood=N): after "How are you feeling today?". A verse of the day chosen
// for that answer, four things to do around it (a hymn, a prayer, a game, the chapter...),
// and "Engage further" for everything else (#/explore).
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
  const picks = [
    hymn && { kind: 'Hymn', icon: 'music', title: hymn.title, sub: chapterHymns.length ? `Based on ${refLabel(ref.book, ref.chapter)}` : 'Sing along', go: `#/sing/${hymn.number}` },
    { kind: 'Game', icon: 'game', title: mood.level <= 2 ? 'Word Search' : 'Bible Trivia', sub: `About ${label}`, go: gameHash(mood.level <= 2 ? 'word-search' : 'trivia', { ref }, here) },
    prayer && { kind: 'Prayer', icon: 'sparkle', title: prayer.title, sub: prayer.attribution ?? prayer.source, go: `#/prayers/${prayer.id}` },
    { kind: 'Scripture', icon: 'next', title: `Read all of ${refLabel(ref.book, ref.chapter)}`, sub: 'Large print, read aloud', go: `#/read?book=${ref.book}&chapter=${ref.chapter}` },
  ].filter(Boolean);
  const open = (hash) => async () => { await ctx.unlock(); ctx.go(hash); };

  const face = h('span', { class: 'mood-face small', 'aria-hidden': 'true' });
  face.innerHTML = faceSvg(mood);
  root.replaceChildren(h('div', { class: 'screen today' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/?ask=1') }, icon('back'), h('span', { class: 'label' }, 'Start over')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Chosen for you'),
      h('p', { class: 'day mood-chip' }, face, mood.label)),
    h('div', { class: 'today-main' },
      h('section', { class: 'card verse-day', tabindex: '0', 'aria-label': `Verse of the day: ${label}` },
        h('p', { class: 'tag added' }, icon('sparkle'), 'Verse of the day'),
        h('h2', { class: 'title' }, passage?.reference ?? label),
        passage
          ? h('div', { class: 'read-lines' }, passage.verses.map((v) => h('p', { class: 'read-line' }, h('sup', { class: 'vnum' }, String(v.num)), ' ', v.text)))
          : h('p', { class: 'big-text' }, 'The verse could not be loaded right now.'),
        passage && h('p', { class: 'muted small attribution' }, passage.attribution)),
      h('div', { class: 'today-picks', role: 'group', 'aria-label': 'Four things for you' },
        picks.map((p) => h('button', { class: 'pick-tile', type: 'button', onclick: open(p.go) },
          h('span', { class: 'pick-kind' }, icon(p.icon), p.kind),
          h('span', { class: 'pick-title' }, p.title),
          h('span', { class: 'pick-sub' }, p.sub))))),
    h('footer', { class: 'bottombar' },
      h('button', { class: 'pill primary big engage', type: 'button', onclick: () => ctx.go('#/explore') },
        h('span', { class: 'label' }, 'Engage further: Bible, hymns, plans, games'), icon('next')))));
  return null;
}
