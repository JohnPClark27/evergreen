// studies.mjs - tablet side of study plans: the list, then a plan using EVERY module type,
// walked with the big buttons. Expects a published plan titled "ZZ All modules" (the
// caller creates it and removes it afterwards). Usage: node studies.mjs [baseUrl]
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
await page.getByRole('button', { name: /Choose a Study/ }).click();
await page.locator('.study-tile').first().waitFor({ timeout: 30000 });
ok((await page.locator('.study-tile').count()) === 6, `study list: 6 cards on page 1 (${await text('.topbar .day')})`);
await shot('studies');

// find the all-modules plan across pages
for (let p = 0; p < 5 && !(await page.getByRole('button', { name: /ZZ All modules/ }).count()); p++) {
  await page.getByRole('button', { name: /More studies/ }).click(); await page.waitForTimeout(300);
}
await page.getByRole('button', { name: /ZZ All modules/ }).click();
await page.locator('.where').waitFor();
ok((await text('.where')).startsWith('Part 1 of 7'), 'runner: ' + await text('.where'));
await page.locator('.lyric-word').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(8000);
ok((await text('.lyric-word.now')).length > 0, 'hymn module: word lit "' + await text('.lyric-word.now') + '"');
await shot('runner-hymn');
await next(); await page.locator('.read-line').first().waitFor({ timeout: 30000 });
ok((await text('.attribution')).includes('YouVersion'), 'scripture module: ' + await text('.reading-panel .title'));
await next(); await page.locator('.reading-panel .read-line').first().waitFor();
ok((await text('.reading-panel .title')).includes('Test note'), 'note module: ' + await text('.reading-panel .title'));
await next(); await page.locator('.quiz-choice').first().waitFor();
await page.locator('.quiz-choice').first().click();
ok((await text('.quiz-reveal')).startsWith('The answer is'), 'quiz module: ' + await text('.quiz-reveal'));
ok(!(await page.locator('.quiz').innerText()).match(/score|correct|wrong/i), 'quiz shows no score / right / wrong');
ok((await axe(page)).length === 0, 'axe clean: quiz (answer revealed)');
await shot('runner-quiz');
await next(); await page.locator('.finish-line').waitFor({ timeout: 30000 });
const before = await text('.finish-blank');
await page.getByRole('button', { name: 'Show the words' }).click();
ok((await axe(page)).length === 0, 'axe clean: finish the line');
ok(before.includes('_') && !(await text('.finish-blank')).includes('_'), `finish-the-line: "${before}" → "${await text('.finish-blank')}"`);
await shot('runner-finish');
await next(); await page.locator('.reading-panel.centered').waitFor();
ok((await text('.attribution')).length > 0, 'prayer module: ' + await text('.reading-panel .title') + ' | ' + await text('.attribution'));
await next(); await page.locator('.lyric-word').first().waitFor({ timeout: 30000 });
ok((await text('.where')).startsWith('Part 7 of 7'), 'last module: ' + await text('.where'));
ok((await page.getByRole('button', { name: 'Finish' }).count()) === 1, 'last part says Finish');
await page.getByRole('button', { name: 'Back' }).click(); await page.locator('.reading-panel.centered').waitFor();
ok((await text('.where')).startsWith('Part 6'), 'Back works: ' + await text('.where'));
await next(); await page.locator('.lyric-word').first().waitFor({ timeout: 30000 });
await page.reload(); await page.getByRole('button', { name: 'Tap to continue' }).click();
await page.locator('.where').waitFor();
ok((await text('.where')).startsWith('Part 7 of 7'), 'reload resumes at the same part');
await page.getByRole('button', { name: 'Finish' }).click();
await page.getByRole('heading', { name: /end of this study/ }).waitFor();
await page.getByRole('button', { name: 'Enjoyed it' }).click();
await page.getByRole('button', { name: 'Choose another study' }).click();
await page.locator('.study-tile').first().waitFor();
ok((await text('.study-tile')).includes('ZZ All modules') && (await text('.study-tile')).includes('Enjoyed before'), 'enjoyed study is listed first');
ok(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
