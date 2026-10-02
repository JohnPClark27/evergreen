// e2e.mjs - first-time user at iPad size (1180×820), big buttons only: Day 1 end to end,
// Finish, notes, Sing a Hymn, reload-resume, portrait. Usage: node e2e.mjs [baseUrl] [reduce]
import { BASE, launch } from './launch.mjs';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, reducedMotion: process.argv[3] === 'reduce' ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const text = (sel) => page.locator(sel).first().innerText().catch(() => '');

await page.goto(BASE);
await page.getByRole('heading', { name: 'Welcome.' }).waitFor(); await page.waitForTimeout(800);
ok((await page.locator('.tile').count()) === 3, 'home: 3 tiles');
await page.getByRole('button', { name: /Today/ }).click();
await page.locator('.lyric-word').first().waitFor({ timeout: 30000 });
ok((await text('.topbar .day')) === 'Day 1 of 12', 'session: ' + await text('.topbar .day'));
await page.waitForTimeout(9000);
ok((await text('.lyric-word.now')).length > 0, 'hymn: word highlighted "' + await text('.lyric-word.now') + '"');
await page.getByRole('button', { name: 'Next' }).click();
await page.locator('.read-line').first().waitFor({ timeout: 30000 });
ok((await text('.attribution')).includes('YouVersion'), 'scripture: ' + await text('.reading-panel .title') + ' + attribution');
await page.getByRole('button', { name: 'Next' }).click();
await page.locator('.reading-panel.centered .read-line').first().waitFor();
ok((await text('.attribution')).length > 0, 'prayer: ' + await text('.reading-panel .title') + ' | ' + await text('.attribution'));
await page.getByRole('button', { name: 'Finish' }).click();
await page.getByRole('heading', { name: /today’s session/ }).waitFor();
ok((await page.locator('.done').innerText()).includes('Day 2 will be ready next time'), 'finished: Day 2 next');
await page.getByRole('button', { name: 'Enjoyed it' }).click();
const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.progress')));
ok(progress.currentDay === 2, 'progress saved in localStorage: ' + JSON.stringify(progress));
await page.getByRole('button', { name: 'Home' }).click();
await page.getByRole('heading', { name: 'Welcome.' }).waitFor();
await page.getByRole('button', { name: /Sing a Hymn/ }).click();
await page.locator('.hymn-tile').first().waitFor();
ok((await page.locator('.hymn-tile').count()) === 9 && (await text('.hymn-tile')).includes('Enjoyed before'), 'sing: 3x3 grid, enjoyed first');
await page.locator('.hymn-tile').nth(1).click();
await page.locator('.lyric-word').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(9000);
ok((await text('.lyric-word.now')).length > 0, 'singing: ' + await text('.hymn-panel .title'));
await page.goto(BASE + '#/session'); await page.reload();
await page.getByRole('button', { name: 'Tap to continue' }).click();
await page.locator('.topbar .day').waitFor();
ok((await text('.topbar .day')) === 'Day 2 of 12', 'reload resumes: ' + await text('.topbar .day'));
await page.setViewportSize({ width: 820, height: 1180 });
await page.goto(BASE + '#/'); await page.getByRole('heading', { name: 'Welcome.' }).waitFor();
ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'portrait: no sideways scroll');
if (process.argv[3] === 'reduce') {
  const tr = await page.evaluate(() => { const d = document.createElement('span'); d.className = 'lyric-word'; document.body.append(d); return getComputedStyle(d).transitionDuration; });
  ok(tr === '0s', 'reduced motion: transitions off (' + tr + ')');
}
ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
