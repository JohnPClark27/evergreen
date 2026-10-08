// app.js - Evergreen Studio: sign in, build study plans, (admins) review and manage.
//
//   #/plans          My study plans            #/review       Admin: plans waiting for review
//   #/plan/new       New plan                  #/hymns        Admin: hymn library (publish / familiar)
//   #/plan/<id>      Edit / view a plan        #/prayers      Admin: prayer library
//   #/account        Your name                 #/people       Admin: who can sign in, roles
//                                              #/audit        Admin: audit log
//                                              #/ai           Admin: AI prompt (Chosen for you)
import * as db from './db.js';
import { h } from '../../js/ui.js';
import * as plans from './pages/plans.js';
import * as editor from './pages/editor.js';
import * as review from './pages/review.js';
import * as hymns from './pages/hymns.js';
import * as prayers from './pages/prayers.js';
import * as people from './pages/people.js';
import * as audit from './pages/audit.js';
import * as account from './pages/account.js';
import * as ai from './pages/ai.js';

const root = document.getElementById('studio');
const ROUTES = [
  [/^\/?(plans)?$/, plans, false],
  [/^\/plan\/(new|\d+)$/, editor, false],
  [/^\/review$/, review, true],
  [/^\/hymns$/, hymns, true],
  [/^\/prayers$/, prayers, true],
  [/^\/people$/, people, true],
  [/^\/audit$/, audit, true],
  [/^\/account$/, account, false],
  [/^\/ai$/, ai, true],
];

const app = {
  profile: null,
  go(hash) { location.hash = hash; },
  /** Pages with unsaved work set this; navigation asks before leaving. */
  dirty: null,
};
window.addEventListener('beforeunload', (e) => { if (app.dirty?.()) { e.preventDefault(); e.returnValue = ''; } });

// ---------------------------------------------------------------------------
// Sign in (magic link): no passwords to remember or store.
// ---------------------------------------------------------------------------

function signInScreen(message = null) {
  const email = h('input', { class: 'input', type: 'email', id: 'email', autocomplete: 'email', required: true });
  const code = h('input', { class: 'input narrow', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code',
    maxlength: '10', placeholder: '12345678' });
  const status = h('p', { role: 'status', class: message ? 'banner warn' : 'muted' }, message ?? '');
  const sendBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Email me a sign-in link');
  const codeBox = h('div', { class: 'field', hidden: true },
    h('label', { class: 'field-label', for: 'code' }, 'Sign-in code'),
    h('div', { class: 'btn-row' }, code, h('button', { class: 'btn primary', type: 'button', onclick: useCode }, 'Sign in')),
    h('p', { class: 'field-hint' }, 'Only if you were given a code. Otherwise just click the link in the email: it works in any browser.'));
  const haveCode = h('button', { class: 'btn small', type: 'button', onclick: () => { codeBox.hidden = false; code.focus(); } }, 'I have a sign-in code');

  async function useCode() {
    if (!email.value.trim() || !code.value.trim()) { status.textContent = 'Enter your email and the code.'; return; }
    status.className = 'muted';
    status.textContent = 'Signing in…';
    try {
      await db.verifyCode(email.value.trim(), code.value);
      // onAuthChange (below) routes into the Studio.
    } catch (err) { status.className = 'banner error'; status.textContent = err.message; }
  }
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); useCode(); } });

  const form = h('form', { class: 'panel' },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'email' }, 'Your email'), email),
    h('div', { class: 'btn-row' }, sendBtn, haveCode),
    codeBox, status);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    sendBtn.disabled = true;
    status.className = 'muted';
    status.textContent = 'Sending…';
    try {
      await db.sendSignInLink(email.value.trim());
      status.className = 'banner ok';
      status.textContent = `Check ${email.value.trim()} for a sign-in link and click it (on this or any device). It works once, for one hour.`;
    } catch (err) {
      status.className = 'banner error';
      status.textContent = err.message;
    }
    sendBtn.disabled = false;
  });
  root.replaceChildren(h('main', { class: 'signin' },
    h('h1', {}, 'Evergreen Studio'),
    h('p', {}, 'Build study plans for older adults: hymns, Scripture, prayers, notes, gentle quizzes and games. ',
      'An admin reviews each plan before anyone sees it in Evergreen.'),
    form,
    h('p', { class: 'muted small' }, 'No password needed. We only use your email to sign you in and to show admins who wrote a plan.')));
  email.focus();
}

// ---------------------------------------------------------------------------
// Shell + router
// ---------------------------------------------------------------------------

function shell(active) {
  const admin = app.profile?.role === 'admin';
  const link = (hash, label, key) => h('a', { class: 'nav', href: hash, 'aria-current': key === active ? 'page' : null }, label);
  const main = h('main', { class: 'page', id: 'main' });
  root.replaceChildren(h('div', { class: 'shell' },
    h('nav', { class: 'topnav', 'aria-label': 'Studio' },
      h('a', { class: 'brand', href: '#/plans' },
        h('img', { src: '../img/evergreen-wordmark-white.png', alt: 'Evergreen', width: '1154', height: '224' }), h('span', {}, 'Studio')),
      link('#/plans', 'My plans', 'plans'),
      admin && link('#/review', 'Review', 'review'),
      admin && link('#/hymns', 'Hymns', 'hymns'),
      admin && link('#/prayers', 'Prayers', 'prayers'),
      admin && link('#/people', 'People', 'people'),
      admin && link('#/ai', 'AI prompt', 'ai'),
      admin && link('#/audit', 'Audit log', 'audit'),
      h('span', { class: 'who' },
        h('a', { href: '#/account' }, app.profile?.display_name || 'Your name'),
        admin && h('span', { class: 'chip' }, 'admin'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => { await db.signOut(); location.hash = '#/'; } }, 'Sign out'))),
    main));
  return main;
}

let cleanup = null;
let lastHash = location.hash;
async function route() {
  // Unsaved edits: ask before leaving the page (and put the address back if they stay).
  if (app.dirty?.() && !confirm('You have unsaved changes. Leave without saving?')) {
    history.replaceState(null, '', lastHash || '#/plans');
    return;
  }
  app.dirty = null;
  lastHash = location.hash;
  try { cleanup?.(); } catch (err) { console.error(err); }
  cleanup = null;

  // Back from an email link: supabase-js reads #access_token=… itself; we just tidy the address.
  // An error (#error=…) is shown on the sign-in screen instead of being treated as a page.
  const linkErr = db.linkError();
  const fromLink = /access_token=|error=/.test(location.hash);
  const signedIn = await db.session();
  if (fromLink) {
    history.replaceState(null, '', `${location.pathname}#/plans`);
    lastHash = location.hash;
  }
  if (!signedIn) { signInScreen(linkErr); return; }
  app.profile = await db.myProfile().catch(() => null);

  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const found = ROUTES.map(([re, page, adminOnly]) => ({ m: re.exec(path || '/'), page, adminOnly })).find((x) => x.m);
  const { page = plans, adminOnly = false, m = null } = found ?? {};
  params.arg = m?.[1];
  const key = Object.entries({ plans, editor, review, hymns, prayers, people, audit, account, ai })
    .find(([, mod]) => mod === page)?.[0];
  const main = shell(key === 'editor' ? 'plans' : key);

  if (adminOnly && app.profile?.role !== 'admin') {
    main.append(h('h1', {}, 'Admins only'), h('p', {}, 'This page is for admins. Ask an admin if you need access.'));
    return;
  }
  try {
    cleanup = (await page.render(main, params, app)) ?? null;
  } catch (err) {
    console.error(err);
    main.replaceChildren(h('h1', {}, 'Something went wrong'), h('p', { class: 'banner error' }, err.message),
      h('a', { href: '#/plans' }, 'Back to my plans'));
  }
  main.querySelector('h1')?.setAttribute('tabindex', '-1');
  main.querySelector('h1')?.focus({ preventScroll: true });
}

window.addEventListener('hashchange', route);
// Signed in (code or link) or out: re-route.
db.onAuthChange((event) => {
  if (event === 'SIGNED_IN' && !app.profile) setTimeout(route, 0); // let supabase-js finish first
  if (event === 'SIGNED_OUT') { app.profile = null; route(); }
});
route();
