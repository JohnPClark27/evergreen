// e2e.mjs - first-time user at iPad size (1180×820), big buttons only: Choose a Study Plan, run
// one end to end, Finish, notes, Sing a Hymn, reload-resume, portrait. Usage: node e2e.mjs [baseUrl] [reduce]
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
await page.getByRole('button', { name: /Choose a Study Plan/ }).click();
await page.locator('.study-tile').first().waitFor({ timeout: 30000 });
ok((await page.locator('.study-tile').count()) >= 1, 'plan list: ' + await page.locator('.study-tile').count() + ' cards');
// Prefer the test plan from fixture_all_modules.py when it's there; else the first plan.
const planBtn = (await page.getByRole('button', { name: /ZZ All modules/ }).count())
  ? page.getByRole('button', { name: /ZZ All modules/ }) : page.locator('.study-tile').first();
const first = (await planBtn.locator('.study-tile-title').innerText());
await planBtn.click();
await page.locator('.continue').waitFor();
ok(/^0 of \d+ done$/.test(await text('.topbar .day')), `plan page "${first}": ` + await text('.topbar .day'));
await page.locator('.continue').click();
await page.locator('.where').waitFor({ timeout: 30000 });
ok(/^Part 1 of \d+/.test(await text('.where')), 'study: ' + await text('.where') + ' | ' + await text('.plan-name'));
if ((await text('.where')).includes('Hymn')) {
  await page.locator('.lyric-word').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(9000);
  ok((await text('.lyric-word.now')).length > 0, 'hymn: word highlighted "' + await text('.lyric-word.now') + '"');
}
// Walk every part with the big buttons; check Scripture shows its attribution.
let sawScripture = false;
for (let i = 0; i < 40 && !(await page.getByRole('button', { name: 'Finish' }).count()); i++) {
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(700);
  if (!sawScripture && (await text('.where')).includes('Scripture')) {
    await page.locator('.attribution').waitFor({ timeout: 30000 });
    sawScripture = (await text('.attribution')).includes('YouVersion');
  }
}
ok(sawScripture, 'scripture showed with the YouVersion attribution');
await page.getByRole('button', { name: 'Finish' }).click();
await page.getByRole('heading', { name: /end of this study/ }).waitFor();
await page.getByRole('button', { name: 'Enjoyed it' }).click();
const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.studyNotes')));
ok(Object.values(notes).includes('enjoyed'), 'plan note saved in localStorage');
await page.getByRole('button', { name: /Back to the plan/ }).click();
await page.locator('.continue').waitFor();
ok(/^1 of \d+ done$/.test(await text('.topbar .day')), 'progress saved on the tablet: ' + await text('.topbar .day'));
await page.getByRole('button', { name: 'All plans' }).click();
await page.locator('.study-tile').first().waitFor();
ok((await page.locator('.study-tile').first().innerText()).includes('Enjoyed before'), `enjoyed plan listed first (${first})`);
await page.getByRole('button', { name: 'Home' }).click();
await page.getByRole('heading', { name: 'Welcome.' }).waitFor();
await page.getByRole('button', { name: /Sing a Hymn/ }).click();
await page.locator('.hymn-tile').first().waitFor();
ok((await page.locator('.hymn-tile').count()) === 9, 'sing: 3x3 grid');
await page.locator('.hymn-tile').nth(1).click();
await page.locator('.lyric-word').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(9000);
ok((await text('.lyric-word.now')).length > 0, 'singing: ' + await text('.hymn-panel .title'));
await page.goto(BASE + '#/studies'); await page.locator('.study-tile').first().click();
await page.locator('.continue').click();
await page.locator('.where').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(800);
await page.reload();
await page.getByRole('button', { name: 'Tap to continue' }).click();
await page.locator('.where').waitFor();
ok((await text('.where')).startsWith('Part 2 of'), 'reload resumes: ' + await text('.where'));
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
