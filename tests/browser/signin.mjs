// signin.mjs - the Studio's three ways back from sign-in, with a throwaway user:
//   1. the email LINK opened in a fresh browser (not the one that asked: that's what broke)
//   2. a one-time CODE typed into "I have a sign-in code"
//   3. an expired/used link (#error=…) shows a clear message
// Usage: node signin.mjs <baseUrl> <signin.json>   (signin.json from studio_users.py link)
import { readFileSync } from 'node:fs';
import { BASE, launch } from './launch.mjs';

const info = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const browser = await launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

// 1. link, in a brand-new browser context (no stored state at all)
{
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(info.link);
  await page.getByRole('heading', { name: 'My study plans' }).waitFor({ timeout: 30000 });
  ok(true, 'email link signs in, even in a different browser');
  ok(!/access_token/.test(page.url()) && page.url().endsWith('#/plans'), 'the token is removed from the address: ' + page.url().replace(/^https?:\/\/[^/]+/, ''));
  await page.reload();
  await page.getByRole('heading', { name: 'My study plans' }).waitFor({ timeout: 30000 });
  ok(true, 'still signed in after a reload');
  ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
}

// 2. code
{
  const page = await (await browser.newContext()).newPage();
  await page.goto(BASE + 'studio/');
  await page.getByRole('button', { name: 'I have a sign-in code' }).click();
  await page.getByLabel('Your email').fill(info.email);
  await page.getByLabel('Sign-in code').fill(info.code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'My study plans' }).waitFor({ timeout: 30000 });
  ok(true, 'one-time code signs in');
}

// 3. an expired / already-used link
{
  const page = await (await browser.newContext()).newPage();
  await page.goto(BASE + 'studio/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await page.getByRole('button', { name: 'Email me a sign-in link' }).waitFor({ timeout: 30000 });
  const msg = await page.locator('[role=status]').innerText();
  ok(/expired or was already used/.test(msg), 'expired link explains itself: ' + msg.slice(0, 80));
}

console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
