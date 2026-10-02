// studio.mjs - the Studio end to end, as a real author and a real admin:
// build a plan from mixed modules, reorder, preview (real tablet frame), submit; admin
// approves; the tablet lists it; the hymn library refuses a not-fully-public-domain hymn.
// Usage: node studio.mjs <baseUrl> <users.json from studio_users.py make>
import { readFileSync } from 'node:fs';
import { BASE, axe, launch } from './launch.mjs';

const users = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const browser = await launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const shots = process.env.SHOTS;
const audits = [];
async function audit(page, name) { const v = await axe(page); audits.push(name); ok(v.length === 0, `axe clean: ${name}${v.length ? ' → ' + v.join(' | ') : ''}`); }

// sign-in screen (no session)
{
  const p = await (await browser.newContext()).newPage();
  await p.goto(BASE + 'studio/');
  await p.getByRole('button', { name: 'Email me a sign-in link' }).waitFor({ timeout: 30000 });
  await audit(p, 'studio sign-in');
}

async function signedIn(role) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Put the test user's session where supabase-js keeps it (storageKey 'hr-studio-auth').
  await context.addInitScript((s) => localStorage.setItem('hr-studio-auth', JSON.stringify(s)), users[role].session);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  return page;
}
const okDialog = (page) => page.locator('dialog[open] .btn.primary, dialog[open] .btn.danger').click();

// ---------------- author ----------------
const a = await signedIn('author');
await a.goto(BASE + 'studio/');
await a.getByRole('heading', { name: 'My study plans' }).waitFor({ timeout: 30000 });
ok((await a.getByText('ZZ Author').count()) > 0, 'author is signed in (name in the top bar)');
ok((await a.getByRole('link', { name: 'Review' }).count()) === 0, 'author sees no admin pages');
await audit(a, 'studio: my plans (empty)');
await a.getByRole('link', { name: /New study plan|first study plan/ }).first().click();
await a.getByLabel('Title').fill('ZZ Studio e2e');
await a.getByLabel('Description').fill('test plan');

const add = (name) => a.locator('.palette-btn', { hasText: name }).first().click();
await add('Hymn');
await a.locator('.item').last().locator('select[size] option').first().waitFor();
await a.locator('.item').last().locator('select[size]').selectOption({ index: 0 });
await add('Scripture');
await add('Note');
await a.locator('.item').last().locator('textarea').fill('Test line one.\nTest line two.');
await add('Quiz');
const quiz = a.locator('.item').last();
await quiz.getByLabel('Question', { exact: true }).fill('Test question?');
await quiz.locator('.choice-edit input[type=text]').nth(0).fill('One');
await quiz.locator('.choice-edit input[type=text]').nth(1).fill('Two');
await add('Hymn');
await a.locator('.item').last().locator('select[size]').selectOption({ index: 1 });
ok((await a.locator('.item').count()) === 5, 'five modules added (hymn, scripture, note, quiz, hymn)');
ok((await a.locator('.item.has-errors').count()) === 0, 'no validation errors');
await audit(a, 'studio: editor with 5 modules open');
if (shots) await a.screenshot({ path: `${shots}/studio-editor.png`, fullPage: true });

await a.getByRole('button', { name: 'Save', exact: true }).click();
await a.waitForURL(/#\/plan\/\d+/);
await a.getByRole('heading', { name: 'ZZ Studio e2e' }).waitFor();
ok((await a.locator('.item').count()) === 5, 'saved and reloaded with 5 modules');

// reorder with ▼ (keyboard-friendly path), then save
await a.getByRole('button', { name: 'Move part 1 down' }).click();
ok((await a.locator('.item').nth(0).locator('.item-name').innerText()) === 'Scripture', 'move down: Scripture is now first');
await a.getByRole('button', { name: 'Save', exact: true }).click();
await a.getByText('Saved.').waitFor();

// a quiz with no right answer filled must block saving
await a.locator('.item').nth(3).getByRole('button', { name: /Edit|Done/ }).click();
await a.locator('.item').nth(3).locator('.choice-edit input[type=text]').nth(1).fill('');
ok((await a.locator('.item.has-errors').count()) === 1, 'emptying the quiz’s right answer flags the module');
ok(await a.getByRole('button', { name: 'Submit for review' }).isDisabled(), 'submit is disabled while something needs fixing');
await a.locator('.item').nth(3).locator('.choice-edit input[type=text]').nth(1).fill('Two');
// Back to exactly what was saved: nothing to save, and Submit is allowed again.
ok((await a.getByRole('button', { name: 'Saved', exact: true }).count()) === 1, 'restoring the answer matches the saved plan (no unsaved changes)');

// preview: the real tablet app in a frame
await a.getByRole('button', { name: 'Preview' }).click();
const frame = a.frameLocator('iframe.preview-frame');
await frame.getByRole('button', { name: 'Tap to continue' }).click();
await frame.locator('.where').waitFor({ timeout: 30000 });
ok((await frame.locator('.where').innerText()).startsWith('Part 1 of 5 · Scripture'), 'preview plays the plan: ' + await frame.locator('.where').innerText());
if (shots) await a.screenshot({ path: `${shots}/studio-preview.png` });
await frame.getByRole('button', { name: 'Close' }).click();
ok((await a.locator('.preview').count()) === 0, 'closing the preview returns to the editor');

await a.getByRole('button', { name: 'Submit for review' }).click();
await okDialog(a);
await a.locator('.chip.pending').waitFor();
ok(true, 'submitted: waiting for review');
ok((await a.locator('#plan-title').isDisabled()), 'author can’t edit while waiting');
const planId = Number(a.url().match(/plan\/(\d+)/)[1]);

// ---------------- admin ----------------
const ad = await signedIn('admin');
await ad.goto(BASE + 'studio/#/review');
await ad.getByRole('heading', { name: 'Review study plans' }).waitFor({ timeout: 30000 });
ok((await ad.getByRole('link', { name: 'ZZ Studio e2e' }).count()) === 1, 'admin sees it waiting for review');
await ad.getByRole('link', { name: 'ZZ Studio e2e' }).click();
await ad.getByText('Nothing blocks publishing.').waitFor({ timeout: 30000 });
if (shots) await ad.screenshot({ path: `${shots}/studio-review.png`, fullPage: true });
await audit(ad, 'studio: admin review panel');
await ad.getByRole('button', { name: 'Approve and publish' }).click();
await ad.getByText('Approved: it’s live on the tablets.').waitFor();
ok(true, 'admin approved it');

// tablet sees it
const tab = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
await tab.goto(BASE + '#/studies');
await tab.locator('.study-tile').first().waitFor({ timeout: 30000 });
let found = false;
for (let p = 0; p < 6 && !found; p++) {
  found = (await tab.getByRole('button', { name: /ZZ Studio e2e/ }).count()) > 0;
  if (!found && await tab.getByRole('button', { name: /More studies/ }).isEnabled().catch(() => false)) {
    await tab.getByRole('button', { name: /More studies/ }).click(); await tab.waitForTimeout(300);
  } else break;
}
ok(found, 'the approved plan is on the tablet’s list');

// hymn library: the public-domain rule refuses #8 (transcribed from a 1982 hymnal)
await ad.goto(BASE + 'studio/#/hymns');
await ad.getByLabel('Search hymns').fill('All Creatures');
await ad.locator('tr', { hasText: 'All Creatures of Our God and King' }).getByRole('button', { name: 'Publish' }).click();
await ad.locator('.banner.error').waitFor({ timeout: 30000 });
await audit(ad, 'studio: hymns');
ok((await ad.locator('.banner.error').innerText()).includes('not fully public domain'), 'PD rule refuses #8: ' + (await ad.locator('.banner.error').innerText()).slice(0, 110));
await ad.goto(BASE + 'studio/#/people');
await ad.locator('td', { hasText: users.author.email }).waitFor({ timeout: 30000 });
ok(true, 'People lists the author');
await audit(ad, 'studio: people');
await ad.goto(BASE + 'studio/#/audit');
await ad.locator('tbody tr').first().waitFor({ timeout: 30000 });
ok((await ad.locator('tbody').innerText()).includes(users.author.email), 'audit log shows the author’s changes by email');
ok(planId > 0, `plan id ${planId}`);

ok(a.errors.length === 0 && ad.errors.length === 0, 'no console errors ' + JSON.stringify([...a.errors, ...ad.errors]));
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
