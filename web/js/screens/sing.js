// Sing a Hymn: a 3×3 grid of familiar hymns (enjoyed ones first, skipped ones hidden),
// and a simple player for one hymn (#/sing/<number>).
import * as api from '../api.js';
import { hymnPanel } from '../hymn-panel.js';
import { h, icon } from '../ui.js';

const PER_PAGE = 9;

export async function render(root, params, ctx) {
  return params.arg ? player(root, Number(params.arg), ctx) : grid(root, Number(params.page ?? 0), ctx);
}

async function grid(root, page, ctx) {
  const notes = ctx.store.notes();
  const hymns = (await api.getFamiliarHymns())
    .filter((x) => x.audio_path && notes[x.number] !== 'skip')
    .sort((a, b) => ((notes[b.number] === 'enjoyed') - (notes[a.number] === 'enjoyed')) || a.title.localeCompare(b.title));
  const pages = Math.max(1, Math.ceil(hymns.length / PER_PAGE));
  page = Math.min(Math.max(0, page), pages - 1);
  const shown = hymns.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  root.append(h('div', { class: 'screen sing' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Sing a Hymn'),
      h('p', { class: 'day' }, pages > 1 ? `Page ${page + 1} of ${pages}` : '')),
    shown.length
      ? h('div', { class: 'hymn-grid' }, shown.map((x) => h('button', {
        class: 'hymn-tile', type: 'button',
        onclick: async () => { await ctx.unlock(); ctx.go(`#/sing/${x.number}`); },
      },
      h('span', { class: 'hymn-tile-title' }, x.title),
      x.first_line && h('span', { class: 'hymn-tile-line' }, x.first_line),
      notes[x.number] === 'enjoyed' && h('span', { class: 'tag' }, 'Enjoyed before'))))
      : h('p', { class: 'big-text card' }, 'No hymns to show. (Hymns marked “Skip next time” are hidden; the aide can reset notes.)'),
    pages > 1 && h('footer', { class: 'bottombar' },
      h('button', { class: 'pill', type: 'button', disabled: page === 0, onclick: () => ctx.go(`#/sing?page=${page - 1}`) },
        icon('back'), h('span', { class: 'label' }, 'Previous hymns')),
      h('button', { class: 'pill primary', type: 'button', disabled: page >= pages - 1, onclick: () => ctx.go(`#/sing?page=${page + 1}`) },
        h('span', { class: 'label' }, 'More hymns'), icon('next')))));
  return null;
}

async function player(root, number, ctx) {
  const { audio } = ctx;
  const hymn = await api.getHymn(number);
  if (!hymn) {
    root.append(h('div', { class: 'screen message' },
      h('h1', { class: 'big-text', tabindex: '-1' }, 'That hymn isn’t available.'),
      h('button', { class: 'pill primary', onclick: () => ctx.go('#/sing') }, 'Choose a hymn')));
    return null;
  }
  const panel = hymnPanel(ctx, hymn);
  const pauseBtn = h('button', { class: 'round', type: 'button', 'aria-label': 'Pause' }, icon('pause'));
  const setPauseIcon = () => {
    const p = audio.paused;
    pauseBtn.replaceChildren(icon(p ? 'play' : 'pause'));
    pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
  };
  pauseBtn.addEventListener('click', async () => {
    if (!audio.paused) await audio.pause();
    else if (audio.currentUrl) await audio.resume();
    else await panel.restart(); // it had finished: sing it again
    setPauseIcon();
  });
  const sync = () => setPauseIcon();
  for (const e of ['play', 'pause', 'stop', 'ended']) audio.addEventListener(e, sync);

  // Optional aide notes for this hymn (shown as "Enjoyed before" / hidden in the grid).
  const noteStatus = h('span', { class: 'muted small', 'aria-live': 'polite' });
  const note = (kind) => { ctx.store.setNote(hymn.number, kind); noteStatus.textContent = kind === 'enjoyed' ? 'Noted: shown first next time.' : 'Noted: hidden next time.'; };
  panel.el.append(h('div', { class: 'row aide-row' },
    h('span', { class: 'muted small' }, 'For the aide:'),
    h('button', { class: 'pill small-pill', type: 'button', onclick: () => note('enjoyed') }, 'Enjoyed it'),
    h('button', { class: 'pill small-pill', type: 'button', onclick: () => note('skip') }, 'Skip next time'),
    noteStatus));

  root.append(h('div', { class: 'screen session' },
    h('header', { class: 'topbar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') }, icon('home'), h('span', { class: 'label' }, 'Home')),
      h('h1', { class: 'screen-title', tabindex: '-1' }, 'Sing a Hymn'),
      h('p', { class: 'day' }, `Hymn ${hymn.number}`)),
    h('section', { class: 'card', tabindex: '0', 'aria-label': hymn.title }, panel.el),
    h('footer', { class: 'bottombar' },
      h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/sing') }, icon('back'), h('span', { class: 'label' }, 'All hymns')),
      h('button', { class: 'pill', type: 'button', onclick: () => { panel.restart(); setPauseIcon(); } }, icon('again'), h('span', { class: 'label' }, 'Sing again')),
      pauseBtn,
      h('button', { class: 'pill primary', type: 'button', onclick: () => ctx.go('#/sing') }, h('span', { class: 'label' }, 'Another hymn'), icon('next')))));

  await panel.start();
  setPauseIcon();
  return () => {
    for (const e of ['play', 'pause', 'stop', 'ended']) audio.removeEventListener(e, sync);
    panel.stop();
    audio.stop(1);
  };
}
