// ai_prompt.mjs - the Studio's "AI prompt" page (admins only).
// Usage: node ai_prompt.mjs <baseUrl> <users.json from studio_users.py make>
// Edits one theme, saves, checks it was stored, refuses a 4-verse passage, runs "Try it",
// and checks an author can't open the page. It puts the prompt back as it was; restore the
// "last saved by" line afterwards with (it's real content):
//   npx supabase db query --linked "update ai_prompts set updated_by = '<before>' where id = 'today'"
import { readFileSync } from 'node:fs';
import { BASE, axe, launch } from './launch.mjs';

const users = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const browser = await launch();
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); c ? pass++ : fail++; };

async function signedIn(role) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((s) => localStorage.setItem('hr-studio-auth', JSON.stringify(s)), users[role].session);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  return page;
}

// Author: not allowed.
const a = await signedIn('author');
await a.goto(BASE + 'studio/#/ai');
await a.getByRole('heading', { name: 'Admins only' }).waitFor({ timeout: 30000 });
ok(true, 'an author sees "Admins only"');
ok(!(await a.getByRole('link', { name: 'AI prompt' }).count()), 'an author has no "AI prompt" link');

// Admin.
const p = await signedIn('admin');
await p.goto(BASE + 'studio/');
await p.getByRole('link', { name: 'AI prompt' }).click();
await p.getByRole('heading', { name: /AI prompt/ }).waitFor({ timeout: 30000 });
ok((await p.locator('fieldset.ai-mood').count()) === 5, 'five feelings, each with themes and passages');
const v = await axe(p);
ok(v.length === 0, `axe clean: AI prompt page${v.length ? ' → ' + v.join(' | ') : ''}`);
if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/studio-ai-prompt.png`, fullPage: true });
const before = await p.locator('#ai-themes-3').inputValue();

// Edit a theme and save; reload shows it.
await p.locator('#ai-themes-3').fill(`${before}, zz test theme`);
await p.getByRole('button', { name: 'Save' }).first().click();
await p.getByText(/^Saved\./).waitFor({ timeout: 15000 });
await p.reload(); await p.locator('#ai-themes-3').waitFor({ timeout: 30000 });
ok((await p.locator('#ai-themes-3').inputValue()).includes('zz test theme'), 'a saved theme is stored');
ok((await p.locator('p.muted.small').first().innerText()).includes(users.admin.email), 'shows who saved it last');

// A passage of 4 verses is refused before saving.
const okay = p.locator('fieldset.ai-mood').nth(2);
await okay.getByRole('spinbutton', { name: /passage 1: last verse/ }).fill('99');
await okay.getByRole('spinbutton', { name: /passage 1: last verse/ }).dispatchEvent('change');
ok((await okay.locator('.item-errors').innerText()).includes('At most 3 verses'), 'a long passage shows "At most 3 verses"');
await p.getByRole('button', { name: 'Save' }).first().click();
ok((await p.locator('.banner.error').innerText()).includes('At most 3 verses'), 'and is not saved');

// Put it back exactly as it was (themes and the passage), save.
await p.reload(); await p.locator('#ai-themes-3').waitFor({ timeout: 30000 });
await p.locator('#ai-themes-3').fill(before);
await p.getByRole('button', { name: 'Save' }).first().click();
await p.getByText(/^Saved\./).waitFor({ timeout: 15000 });
ok((await p.locator('#ai-themes-3').inputValue()) === before, 'prompt restored');

// Try it: the AI answers with a reference and 4 picks (or says it was skipped).
await p.selectOption('#ai-try-mood', '5');
await p.getByRole('button', { name: 'Try it' }).click();
await p.locator('.ai-try-out li').first().waitFor({ timeout: 30000 });
const out = await p.locator('.ai-try-out').innerText();
ok(/Chosen by AI|AI skipped/.test(out) && (await p.locator('.ai-try-out li').count()) === 4, `Try it: ${out.split('\n')[0]}`);

ok(!p.errors.length && !a.errors.length, 'no console errors ' + JSON.stringify([...p.errors, ...a.errors]));
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exitCode = fail ? 1 : 0;
