// studies.mjs - tablet side of study plans, with the big buttons: the plan list, a plan's page
// (Start / Continue, ✓ marks), study 1 using EVERY module type, the done screen's "Next",
// study 2, "all done", and "Start this plan over". Expects the published plan "ZZ All modules"
// from fixture_all_modules.py (the caller makes it first and cleans it after).
// Usage: node studies.mjs [baseUrl]
import { BASE, axe, launch } from './launch.mjs';
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const text = (sel) => page.locator(sel).first().innerText().catch(() => '');
const shot = (name) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }) : null);
const next = () => page.getByRole('button', { name: /^(Next|Finish)$/ }).click();

await page.goto(BASE);
await page.getByRole('button', { name: /Choose a Study Plan/ }).click();
await page.locator('.study-tile').first().waitFor({ timeout: 30000 });
await page.getByRole('heading', { name: 'Choose a Study Plan' }).waitFor();
// every plan is in one scrolling grid (no pages)
await page.getByRole('button', { name: /ZZ All modules/ }).scrollIntoViewIfNeeded();
const card = page.getByRole('button', { name: /ZZ All modules/ });
ok((await card.innerText()).includes('2 studies'), 'plan card: ' + (await card.innerText()).replace(/\n/g, ' / '));
await shot('plans');

// ---- the plan page
await card.click();
await page.getByRole('heading', { name: 'ZZ All modules' }).waitFor();
ok((await text('.topbar .day')) === '0 of 2 done', 'plan page: ' + await text('.topbar .day'));
ok((await text('.continue')).includes('Start: Study 1'), 'big button: ' + await text('.continue'));
ok((await page.locator('.study-row').count()) === 2 && (await text('.study-row.next')).includes('ZZ Every module'), 'two studies listed, study 1 is "Next up"');
ok((await axe(page)).length === 0, 'axe clean: plan page');
await shot('plan');

// ---- study 1: every module type
await page.locator('.continue').click();
await page.locator('.where').waitFor();
ok((await text('.where')).startsWith('Part 1 of 7') && (await text('.plan-name')) === 'Study 1 of 2', 'runner: ' + await text('.where') + ' | ' + await text('.plan-name'));
await page.locator('.lyric-word').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(8000);
ok((await text('.lyric-word.now')).length > 0, 'hymn module: word lit "' + await text('.lyric-word.now') + '"');
await shot('runner-hymn');
await next(); await page.locator('.read-line').first().waitFor({ timeout: 30000 });
ok((await text('.attribution')).includes('YouVersion'), 'scripture module: ' + await text('.reading-panel .title'));
// Read-aloud is OFF by default (built-in voices sound robotic); the aide can switch it on.
const voice = page.locator('.voice-toggle');
const badgeShown = async () => page.locator('.reading-panel .badge').isVisible().catch(() => false);
const againOff = async () => page.getByRole('button', { name: 'Read again' }).isDisabled();
ok((await voice.innerText()) === 'Read aloud: Off' && !(await badgeShown()) && (await againOff()),
  'read-aloud is off by default (no "Reading aloud" badge, Read again disabled)');
await voice.click();
ok((await voice.innerText()) === 'Read aloud: On' && (await badgeShown()) && !(await againOff())
  && (await page.evaluate(() => JSON.parse(localStorage.getItem('hr.settings')).readAloud)) === true,
  'switching it on shows the badge, enables Read again, and is saved on the tablet');
await voice.click();
ok((await voice.innerText()) === 'Read aloud: Off' && (await page.evaluate(() => JSON.parse(localStorage.getItem('hr.settings')).readAloud)) === false,
  'switching it off again is saved too');
await next(); await page.locator('.reading-panel .read-line').first().waitFor();
ok((await text('.reading-panel .title')).includes('Test note'), 'note module: ' + await text('.reading-panel .title'));
await next(); await page.locator('.quiz-choice').first().waitFor();
await page.locator('.quiz-choice').first().click();
ok((await text('.quiz-reveal')).startsWith('The answer is'), 'quiz module: ' + await text('.quiz-reveal'));
ok(!(await page.locator('.quiz').innerText()).match(/score|correct|wrong/i), 'quiz shows no score / right / wrong');
ok((await axe(page)).length === 0, 'axe clean: quiz (answer revealed)');
await next(); await page.locator('.finish-line').waitFor({ timeout: 30000 });
const before = await text('.finish-blank');
await page.getByRole('button', { name: 'Show the words' }).click();
ok(before.includes('_') && !(await text('.finish-blank')).includes('_'), `finish-the-line: "${before}" → "${await text('.finish-blank')}"`);
await next(); await page.locator('.reading-panel.centered').waitFor();
ok((await text('.attribution')).length > 0, 'prayer module: ' + await text('.reading-panel .title') + ' | ' + await text('.attribution'));
await next(); await page.locator('.lyric-word').first().waitFor({ timeout: 30000 });
ok((await text('.where')).startsWith('Part 7 of 7') && (await page.getByRole('button', { name: 'Finish' }).count()) === 1, 'last part says Finish');
await page.reload(); await page.getByRole('button', { name: 'Tap to continue' }).click();
await page.locator('.where').waitFor();
ok((await text('.where')).startsWith('Part 7 of 7'), 'reload resumes at the same part of the same study');
await page.getByRole('button', { name: 'Finish' }).click();

// ---- done: points at study 2
await page.getByRole('heading', { name: /end of this study/ }).waitFor();
ok((await page.locator('.done').innerText()).includes('Study 2, ZZ Short study'), 'done screen names the next study');
await page.getByRole('button', { name: 'Enjoyed it' }).click();
await page.getByRole('button', { name: /Back to the plan/ }).click();
await page.getByRole('heading', { name: 'ZZ All modules' }).waitFor();
ok((await text('.topbar .day')) === '1 of 2 done', 'progress saved on the tablet: ' + await text('.topbar .day'));
ok((await page.locator('.study-row.done').count()) === 1 && (await text('.study-row.next')).includes('ZZ Short study'), 'study 1 ticked, study 2 is next');
ok((await text('.continue')).includes('Continue: Study 2'), 'big button: ' + await text('.continue'));

// ---- study 2, then "all done"
await page.locator('.continue').click();
await page.locator('.where').waitFor();
ok((await text('.where')).startsWith('Part 1 of 2') && (await text('.plan-name')) === 'Study 2 of 2', 'study 2: ' + await text('.where'));
await next(); await page.locator('.reading-panel.centered').waitFor();
await page.getByRole('button', { name: 'Finish' }).click();
await page.getByRole('heading', { name: /end of this study/ }).waitFor();
ok((await page.locator('.done').innerText()).includes('That was the last study'), 'done after the last study');
await page.getByRole('button', { name: 'Choose another plan' }).click();
await page.locator('.study-tile').first().waitFor();
const first = await text('.study-tile');
ok(first.includes('ZZ All modules') && first.includes('Enjoyed before') && first.includes('all done'), 'list: enjoyed plan first, "all done": ' + first.replace(/\n/g, ' / '));

// ---- start over, old links
await page.getByRole('button', { name: /ZZ All modules/ }).click();
await page.getByRole('heading', { name: 'ZZ All modules' }).waitFor();
ok((await text('.continue')).includes('Every study is done'), 'all done: ' + await text('.continue'));
await page.getByRole('button', { name: 'Start this plan over' }).click();
await page.locator('dialog[open]').getByRole('button', { name: 'Start over' }).click();
await page.waitForFunction(() => document.querySelector('.topbar .day')?.textContent === '0 of 2 done');
ok((await page.locator('.study-row.done').count()) === 0, 'start over clears the ticks');
const planUrl = page.url();
const planId = planUrl.match(/#\/plan\/(\d+)/)[1];
await page.goto(BASE + `#/study/${planId}`);
await page.getByRole('heading', { name: 'ZZ All modules' }).waitFor({ timeout: 10000 });
ok(page.url().includes(`#/plan/${planId}`), 'old one-study link opens the plan page');
const fresh = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
await fresh.goto(BASE + '#/aide');
await fresh.getByRole('radiogroup', { name: 'Read aloud in studies' }).waitFor();
ok((await fresh.getByRole('radio', { name: 'Off' }).getAttribute('aria-checked')) === 'true', 'Aide tools: read aloud is Off for a fresh tablet');
ok((await axe(fresh)).length === 0, 'axe clean: aide tools with the read-aloud switch');
ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
