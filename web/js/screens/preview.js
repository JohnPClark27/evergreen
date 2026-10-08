// Preview (#/preview): the Studio shows an author's plan, saved or not, exactly as a tablet
// would play it. The Studio puts the plan in sessionStorage ('hr.preview') and opens this
// page in a frame. Nothing is saved on the tablet, and no progress is recorded.
import { runStudy } from '../runner.js';
import { h } from '../ui.js';

export async function render(root, _params, ctx) {
  let plan = null;
  try { plan = JSON.parse(sessionStorage.getItem('hr.preview')); } catch { /* nothing to show */ }
  const close = () => window.parent?.postMessage('hr-preview-close', location.origin);
  if (!plan?.items) {
    root.append(h('div', { class: 'screen message' }, h('h1', { class: 'big-text', tabindex: '-1' }, 'Nothing to preview.')));
    return null;
  }

  let stop = null;
  const start = async () => {
    root.replaceChildren();
    stop = await runStudy(root, plan, ctx, {
      exitLabel: 'Close',
      onExit: close,
      onFinish: () => {
        stop?.();
        root.replaceChildren(h('div', { class: 'screen message' },
          h('h1', { class: 'big-text', tabindex: '-1' }, 'End of the preview.'),
          h('p', { class: 'muted' }, 'In Evergreen, the “finished” screen comes next.'),
          h('div', { class: 'row' },
            h('button', { class: 'pill', type: 'button', onclick: start }, 'Start again'),
            h('button', { class: 'pill primary', type: 'button', onclick: close }, 'Close preview'))));
      },
    });
  };
  await start();
  return () => stop?.();
}
