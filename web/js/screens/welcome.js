// Welcome (#/): a greeting for the time of day and "How are you feeling today?" with five
// big faces. One tap opens "For you" (#/today?mood=N). Aide tools stay in the corner.
import { faceSvg, greeting, MOODS, saveMood, savedMood } from '../mood.js';
import { brandLogo, h } from '../ui.js';

export async function render(root, params, ctx) {
  // Already answered this visit: Home goes back to what was chosen ("Start over" asks again).
  const mood = savedMood();
  if (mood && params.ask !== '1') { ctx.go(`#/today?mood=${mood.level}`); return; }
  const face = (m) => { const s = h('span', { class: 'mood-face' }); s.innerHTML = faceSvg(m); return s; };
  root.append(h('div', { class: 'screen home welcome-screen' },
    h('a', { class: 'aide-link corner', href: '#/aide' }, 'Aide tools'),
    brandLogo(),
    h('h1', { class: 'welcome', tabindex: '-1' }, `${greeting()}.`),
    h('p', { class: 'mood-question', id: 'mood-q' }, 'How are you feeling today?'),
    h('div', { class: 'mood-row', role: 'group', 'aria-labelledby': 'mood-q' },
      MOODS.map((m) => h('button', {
        class: 'mood-tile', type: 'button',
        // Unlock sound inside the tap, so a hymn or reading can start on the next screen.
        onclick: async () => { saveMood(m.level); await ctx.unlock(); ctx.go(`#/today?mood=${m.level}`); },
      }, face(m), h('span', { class: 'mood-label' }, m.label)))),
    h('button', { class: 'link-button skip-mood', type: 'button', onclick: () => ctx.go('#/explore') }, 'Skip and see everything')));
}
