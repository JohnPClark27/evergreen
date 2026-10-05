// ui.js - tiny DOM helpers shared by the screens.

/** h('button', { class: 'big', onclick: fn, 'aria-label': 'Home' }, 'Home') -> element */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Scroll an element to the middle of its scrolling card, gently unless motion is reduced. */
export function bringIntoView(el) {
  el?.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** A modal yes/no question with big buttons. Resolves true/false. */
export function confirmDialog(message, { yes = 'Yes', no = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dialog' },
      h('p', { text: message }),
      h('div', { class: 'dialog-buttons' },
        h('button', { class: 'pill', onclick: () => dlg.close('no') }, no),
        h('button', { class: 'pill primary', onclick: () => dlg.close('yes') }, yes)));
    dlg.addEventListener('close', () => { dlg.remove(); resolve(dlg.returnValue === 'yes'); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** Simple inline icons (decorative: buttons always carry a text label or aria-label). */
export const ICON = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5 8 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4.5 16 12l-7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.2 19 4v11.5a2.5 2.5 0 1 1-2-2.45V7.5l-6 1.3v8.7A2.5 2.5 0 1 1 9 15.05z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
};

/**
 * A control for the bar under the card (Sing again, Show sheet music): a wide rounded button
 * with its icon and word inside; when the bar is narrow, CSS turns it into a circle with the
 * word underneath. The word is the button's name for screen readers too.
 */
export function roundControl(iconName, label) {
  const btn = h('button', { class: 'ctl', type: 'button' },
    h('span', { class: 'ctl-circle' }), h('span', { class: 'label' }));
  setControl(btn, iconName, label);
  return btn;
}

/** Change a control's icon and word (e.g. Show → Close sheet music). */
export function setControl(btn, iconName, label) {
  btn.querySelector('.ctl-circle').replaceChildren(icon(iconName));
  btn.querySelector('.label').textContent = label;
}

/** <span> with an icon from ICON (SVG markup is a fixed constant, not user data). */
export function icon(name) {
  const span = h('span', { class: 'icon' });
  span.innerHTML = ICON[name];
  return span;
}
