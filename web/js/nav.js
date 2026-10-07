// nav.js - where the top-left button goes. There are two hubs:
//   My Day          (#/ : "How are you feeling?", then the verse and four picks)
//   Engage further  (#/explore : Read Scripture, Worship, Games, Start a Bible Study)
// Each hub remembers itself when shown (sessionStorage, this visit only). Every other screen's
// top-left button returns to the hub the person came from: "Back to engage" or "My Day".
import { h, icon } from './ui.js';

const KEY = 'hr.hub';

export function setHub(hub) { try { sessionStorage.setItem(KEY, hub); } catch { /* fine */ } }
export function currentHub() { try { return sessionStorage.getItem(KEY) === 'explore' ? 'explore' : 'myday'; } catch { return 'myday'; } }

/** "My Day" (home icon): back to the person's My Day (or the feeling question if not asked yet). */
export const myDayButton = (ctx) => h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/') },
  icon('home'), h('span', { class: 'label' }, 'My Day'));

/** The top-left button for any screen under a hub: "Back to engage" or "My Day". */
export function hubButton(ctx) {
  if (currentHub() !== 'explore') return myDayButton(ctx);
  return h('button', { class: 'pill', type: 'button', onclick: () => ctx.go('#/explore') },
    icon('back'), h('span', { class: 'label' }, 'Back to engage'));
}
