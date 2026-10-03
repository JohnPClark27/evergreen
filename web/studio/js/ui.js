// ui.js - small Studio helpers (status chips, dialogs, dates).
import { h } from '../../js/ui.js';

export { h };

export const STATUS_LABEL = {
  draft: 'Draft',
  pending: 'Waiting for review',
  published: 'Live on tablets',
  approved: 'Approved (not live)',
  archived: 'Archived',
};

export const chip = (status) => h('span', { class: `chip ${status}` }, STATUS_LABEL[status] ?? status);

export const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** A modal with a message, an optional text box, and OK/Cancel. Resolves to the text (or true), or null if cancelled. */
export function ask(message, { ok = 'OK', cancel = 'Cancel', input = false, placeholder = '', danger = false } = {}) {
  return new Promise((resolve) => {
    const text = input && h('textarea', { class: 'input', rows: '3', placeholder, maxlength: '500', 'aria-label': message });
    const dlg = h('dialog', { class: 'studio-dialog' },
      h('form', { method: 'dialog' },
        h('p', {}, message),
        text,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', value: 'cancel' }, cancel),
          h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, value: 'ok' }, ok))));
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(dlg.returnValue === 'ok' ? (input ? text.value.trim() : true) : null);
    });
    document.body.append(dlg);
    dlg.showModal();
    (text || dlg.querySelector('.btn.primary, .btn.danger'))?.focus();
  });
}

/** Status line that clears itself. */
export function flash(el, message, kind = 'ok') {
  el.className = `banner ${kind}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(el._t);
  if (kind === 'ok') el._t = setTimeout(() => { el.hidden = true; }, 5000);
}
