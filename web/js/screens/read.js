// Read the Bible: large-print reader with a book/chapter picker and read-aloud.
// Optional: a hymn that cites the chapter plays quietly underneath (OFF by default), and
// "change hymn as I scroll" (also OFF by default) crossfades to the hymn for the verse in view.
import * as api from '../api.js';
import { BOOKS, refLabel } from '../books.js';
import { bringIntoView, h, icon } from '../ui.js';

const MUSIC_LEVEL = 0.45; // background music sits under the reading

export async function render(root, params, ctx) {
  const { audio, speaker } = ctx;
  let book = params.book ?? 'PSA';
  let chapter = Number(params.chapter ?? 23);
  let verses = [];
  let items = [];
  let musicOn = false, followScroll = false, observer = null, switchTimer = null, currentHymn = null;
  let chapterHymns = [];

  const bookSelect = h('select', { class: 'select', 'aria-label': 'Book' },
    BOOKS.map(([code, name]) => h('option', { value: code, selected: code === book }, name)));
  const chapterSelect = h('select', { class: 'select', 'aria-label': 'Chapter' });
  const text = h('div', { class: 'read-lines bible' });
  const heading = h('h2', { class: 'title' });
  const attribution = h('p', { class: 'muted small attribution' });
  const musicNote = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const card = h('section', { class: 'card', tabindex: '-1' }, heading, text, attribution);

  function fillChapters() {
    const n = BOOKS.find((b) => b[0] === book)[2];
    chapterSelect.replaceChildren(...Array.from({ length: n }, (_, i) => h('option', { value: i + 1, selected: i + 1 === chapter }, `Chapter ${i + 1}`)));
  }
  bookSelect.addEventListener('change', () => { book = bookSelect.value; chapter = 1; fillChapters(); load(); });
  chapterSelect.addEventListener('change', () => { chapter = Number(chapterSelect.value); load(); });

  // ---- read aloud ----
  const readBtn = h('button', { class: 'pill primary', type: 'button' }, h('span', { class: 'label' }, 'Read aloud'));
  const pauseBtn = h('button', { class: 'round', type: 'button', 'aria-label': 'Pause' }, icon('pause'));
  readBtn.addEventListener('click', () => { speaker.speakVerses(verses).catch(() => {}); });
  pauseBtn.addEventListener('click', () => {
    if (speaker.state === 'speaking') speaker.pause();
    else if (speaker.state === 'paused') speaker.resume();
  });
  const onSegment = (e) => {
    items.forEach((p, i) => p.classList.toggle('reading', i === e.detail.index));
    bringIntoView(items[e.detail.index]);
  };
  const onEnd = () => items.forEach((p) => p.classList.remove('reading'));
  const onState = (e) => {
    pauseBtn.disabled = e.detail === 'idle';
    pauseBtn.replaceChildren(icon(e.detail === 'paused' ? 'play' : 'pause'));
    pauseBtn.setAttribute('aria-label', e.detail === 'paused' ? 'Continue reading' : 'Pause');
  };
  speaker.addEventListener('segment', onSegment);
  speaker.addEventListener('end', onEnd);
  speaker.addEventListener('state', onState);

  // ---- optional background hymn ----
  const musicToggle = h('input', { type: 'checkbox', id: 'music-toggle' });
  const scrollToggle = h('input', { type: 'checkbox', id: 'scroll-toggle', disabled: true });
  musicToggle.addEventListener('change', () => { musicOn = musicToggle.checked; scrollToggle.disabled = !musicOn; updateMusic(); });
  scrollToggle.addEventListener('change', () => { followScroll = scrollToggle.checked; watchScroll(); });

  /** Best hymn for a verse: one whose ref covers the verse, else one citing the whole chapter. */
  function hymnFor(verse) {
    const covers = (r) => r.verse_start != null && verse != null
      && verse >= Math.min(r.verse_start, r.verse_end ?? 999) && verse <= Math.max(r.verse_start, r.verse_end ?? 999);
    return (chapterHymns.find(covers) ?? chapterHymns[0])?.hymn ?? null;
  }

  async function playHymn(hymn) {
    if (!hymn || hymn.id === currentHymn?.id) return;
    currentHymn = hymn;
    musicNote.textContent = `Playing quietly: ${hymn.title}`;
    await audio.play(api.audioUrl(hymn), { loop: true, fade: 2.5 }).catch(() => {});
  }

  async function updateMusic() {
    if (!musicOn) { audio.stop(1.5); currentHymn = null; musicNote.textContent = ''; watchScroll(); return; }
    audio.setVolume(Math.min(ctx.store.settings().volume, MUSIC_LEVEL));
    if (!chapterHymns.length) { audio.stop(1.5); currentHymn = null; musicNote.textContent = 'No hymn is linked to this chapter.'; return; }
    await playHymn(hymnFor(verses[0]?.num ?? null));
    watchScroll();
  }

  // Scroll-following (off by default): the verse crossing the middle of the card picks the
  // hymn, and the music only changes after staying on a new hymn for 2.5 s (no flip-flopping).
  function watchScroll() {
    observer?.disconnect();
    observer = null;
    if (!musicOn || !followScroll) return;
    observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (!visible.length) return;
      const verse = Number(visible[0].target.dataset.verse);
      clearTimeout(switchTimer);
      switchTimer = setTimeout(() => playHymn(hymnFor(verse)), 2500);
    }, { root: card, rootMargin: '-45% 0px -45% 0px' });
    items.forEach((p) => observer.observe(p));
  }

  async function load() {
    speaker.stop();
    heading.textContent = refLabel(book, chapter);
    text.replaceChildren(h('p', { class: 'muted' }, 'Opening…'));
    attribution.textContent = '';
    try {
      const passage = await api.getPassage(book, chapter);
      verses = passage.verses;
      attribution.textContent = passage.attribution;
    } catch (err) {
      verses = [];
      text.replaceChildren(h('p', { class: 'muted' }, `This chapter could not be loaded. ${err.message}`));
      return;
    }
    items = verses.map((v) => h('p', { class: 'read-line', 'data-verse': v.num }, h('sup', { class: 'vnum' }, String(v.num)), ' ', v.text));
    text.replaceChildren(...items);
    card.scrollTop = 0;
    chapterHymns = await api.getChapterHymns(book, chapter).catch(() => []);
    currentHymn = null;
    updateMusic();
  }

  root.append(h('div', { class: 'screen session read' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('div', { class: 'picker' }, bookSelect, chapterSelect),
      h('p', { class: 'day' }, '')),
    card,
    h('footer', { class: 'bottombar read-bar' },
      h('div', { class: 'music-options' },
        h('label', { class: 'switch', for: 'music-toggle' }, musicToggle, ' Play a matching hymn quietly'),
        h('label', { class: 'switch', for: 'scroll-toggle' }, scrollToggle, ' Change hymn as I scroll'),
        musicNote),
      pauseBtn, readBtn)));

  pauseBtn.disabled = true; // nothing to pause until reading starts
  fillChapters();
  await load();
  return () => {
    clearTimeout(switchTimer);
    observer?.disconnect();
    speaker.removeEventListener('segment', onSegment);
    speaker.removeEventListener('end', onEnd);
    speaker.removeEventListener('state', onState);
    speaker.stop();
    audio.stop(1);
    audio.setVolume(ctx.store.settings().volume);
  };
}
