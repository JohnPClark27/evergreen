// curation.mjs - AI curation + games at iPad size: Welcome -> feeling -> My Day ->
// Engage further -> each tile, thumbs feed the next curate call, slide -> game -> back, AI down (500) -> silent fallback, trivia
// validator drops a fabricated answer, and axe on every new screen.
// Usage: node curation.mjs [baseUrl]
// No Scripture is written here: mocked trivia answers are taken from the verse text the app
// itself sends in the request.
import { BASE, axe, launch } from './launch.mjs';

const browser = await launch();
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); c ? pass++ : fail++; };
const errors = [];
async function fresh() {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return { context, page };
}
const issues = [];
async function audit(page, name) {
  const found = await axe(page);
  if (found.length) issues.push(`${name}: ${found.join('; ')}`);
}

// ---------- 1. Welcome -> a feeling -> Chosen for you -> Engage further -> each tile ----------
{
  const { context, page } = await fresh();
  const bodies = [];
  await page.route('**/functions/v1/curate', async (route) => { bodies.push(JSON.parse(route.request().postData() || '{}')); await route.continue(); });
  await page.goto(BASE); await page.getByRole('heading', { name: /^Good (morning|afternoon|evening)\.$/ }).waitFor();
  ok((await page.locator('.mood-tile').count()) === 5, 'welcome: greeting + 5 feelings');
  await audit(page, 'welcome');
  await page.getByRole('button', { name: 'Having a hard day' }).click();
  await page.locator('.pick-tile').first().waitFor({ timeout: 20000 });
  ok((await page.locator('.pick-tile').count()) === 4, 'chosen for you: 4 picks');
  ok((await page.locator('.verse-day .attribution').innerText()).includes('YouVersion'), 'verse of the day with YouVersion attribution');
  const today = bodies.find((b) => b.action === 'today');
  ok(today?.mood === 5 && !/"text"|verses|name/i.test(JSON.stringify(today)), 'today call sends the mood number, ids and refs only');
  const words = await page.locator('.pick-word').allInnerTexts();
  ok(words.every((w) => ['Hymn', 'Prayer', 'Read', 'Game'].includes(w.trim())), `each pick leads with one word (${words.join(', ')})`);
  await audit(page, 'chosen for you');
  await page.getByRole('button', { name: /Engage further/ }).click();
  await page.getByRole('heading', { name: 'Engage further' }).waitFor();
  ok((await page.locator('.tile').count()) === 4, 'engage further: 4 tiles');
  await audit(page, 'engage further');
  for (const [tile, heading] of [['Read Scripture', null], ['Worship', 'Worship'], ['Games', 'Games'], ['Start a Bible Study', 'Choose a Study Plan']]) {
    await page.goto(BASE + '#/explore'); await page.getByRole('heading', { name: 'Engage further' }).waitFor();
    await page.getByRole('button', { name: new RegExp(`^${tile}`) }).click();
    if (heading) await page.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 20000 });
    else await page.locator('.read-line').first().waitFor({ timeout: 30000 });
    ok(true, `tile "${tile}" opens its screen`);
  }
  await page.getByRole('button', { name: 'Back to engage' }).click();
  await page.getByRole('heading', { name: 'Engage further' }).waitFor();
  await page.getByRole('button', { name: 'My Day' }).click();
  await page.locator('.pick-tile').first().waitFor({ timeout: 20000 });
  ok((await page.locator('h1').innerText()) === 'My Day', '"My Day" returns to My Day during the visit');
  await context.close();
}

// ---------- 1b. Navigation: every screen goes back to the hub it was opened from ----------
{
  const { context, page } = await fresh();
  const label = async () => (await page.locator('.topbar .pill').first().innerText()).trim();
  // From My Day: a prayer pick -> a plain prayer page -> "My Day"
  await page.goto(BASE + '#/today?mood=2'); await page.locator('.pick-tile').first().waitFor({ timeout: 20000 });
  await page.goto(BASE + '#/prayers'); await page.locator('.study-tile').first().click();
  await page.locator('.prayer-screen .read-line').first().waitFor({ timeout: 20000 });
  ok(!(await page.locator('.side-arrow').count()) && (await page.locator('.prayer-screen .attribution').innerText()).length > 0, 'one prayer: a plain page with its source (no Back/Next)');
  ok(await label() === 'My Day', 'prayer opened from My Day: top-left says "My Day"');
  await audit(page, 'one prayer');
  await page.getByRole('button', { name: 'More prayers' }).click();
  await page.getByRole('heading', { name: 'Prayers' }).waitFor();
  ok(await label() === 'My Day' && !(await page.getByRole('button', { name: /Hymns/ }).count()), 'prayer list: "My Day", no link to the hymn list');
  await page.goto(BASE + '#/sing'); await page.locator('.hymn-tile').first().waitFor({ timeout: 20000 });
  ok(await label() === 'My Day' && !(await page.getByRole('button', { name: /Prayers/ }).count()), 'hymn list: "My Day", no link to the prayer list');
  // From Engage further: Worship -> Pray -> "Back to engage"
  await page.goto(BASE + '#/explore'); await page.getByRole('button', { name: /^Worship/ }).click();
  await page.getByRole('heading', { name: 'Worship' }).waitFor();
  await audit(page, 'worship');
  await page.getByRole('button', { name: /^Pray/ }).click(); await page.locator('.study-tile').first().waitFor({ timeout: 20000 });
  ok(await label() === 'Back to engage', 'opened from Engage further: top-left says "Back to engage"');
  await page.getByRole('button', { name: 'Back to engage' }).click();
  await page.getByRole('heading', { name: 'Engage further' }).waitFor();
  ok(true, '"Back to engage" returns to Engage further');
  await context.close();
}

// ---------- 2. A thumbs-up in Sing a Hymn is in the next curate history ----------
{
  const { context, page } = await fresh();
  const bodies = [];
  await page.route('**/functions/v1/curate', async (route) => { bodies.push(JSON.parse(route.request().postData() || '{}')); await route.continue(); });
  await page.goto(BASE + '#/sing'); await page.locator('.hymn-tile').first().click();
  await page.getByRole('button', { name: 'Enjoyed it' }).click();
  await page.goto(BASE + '#/?ask=1'); await page.getByRole('button', { name: 'Okay' }).click();
  await page.locator('.pick-tile').first().waitFor({ timeout: 20000 });
  const sent = bodies.find((b) => b.action === 'today');
  ok(sent?.history?.some((r) => r.type === 'hymn' && r.thumbs === 'up'), 'the thumbs-up hymn is in the history sent');
  ok(!JSON.stringify(sent).match(/@|"name"/i), 'no personal data in the history');
  await context.close();
}

// ---------- 3. Slide -> game -> back to the same part ----------
{
  const { context, page } = await fresh();
  await page.goto(BASE + '#/studies'); await page.getByRole('button', { name: /Sample — 12 Days/ }).click();
  await page.locator('.continue').click();
  await page.locator('.where').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(800);
  const where = await page.locator('.where').innerText();
  await page.getByRole('button', { name: 'Play a game about this' }).click();
  await page.locator('.game-ref').waitFor({ timeout: 30000 });
  const ref = await page.locator('.game-ref').innerText();
  ok(/\d+:\d+/.test(ref) && ref.includes('YouVersion'), `game shows reference + attribution (${ref.slice(0, 60)}…)`);
  await audit(page, `slide game (${await page.locator('h1').innerText()})`);
  await page.getByRole('button', { name: 'Back to study' }).last().click();
  await page.getByRole('button', { name: 'Tap to continue' }).click().catch(() => {});
  await page.locator('.where').waitFor({ timeout: 30000 });
  ok((await page.locator('.where').innerText()) === where, `back to the same part (${where})`);
  await context.close();
}

// ---------- 4. AI down: every curate call fails with 500 -> fallback, nothing breaks ----------
{
  const { context, page } = await fresh();
  await page.route('**/functions/v1/curate', (route) => route.fulfill({ status: 500, body: '{"error":"down"}', contentType: 'application/json' }));
  await page.goto(BASE + '#/today?mood=3');
  await page.locator('.pick-tile').first().waitFor({ timeout: 15000 });
  ok((await page.locator('.pick-tile').count()) === 4, 'AI down: Chosen for you still has a verse and 4 picks (fallback)');
  ok((await page.locator('.verse-day .read-line').count()) >= 1, 'AI down: the example verse is shown');
  await page.goto(BASE + '#/games');
  await page.locator('.game-tile.picked:not([disabled])').waitFor({ timeout: 15000 });
  ok((await page.locator('.game-tile.picked').innerText()).includes('Picked for you'), 'AI down: Games still has "Picked for you"');
  await audit(page, 'games');
  await page.locator('.game-tile.picked').click();
  await page.locator('.game-ref').waitFor({ timeout: 30000 });
  ok(true, 'AI down: the picked game opens');
  await page.goto(BASE + '#/game/trivia?book=PSA&chapter=23&start=1&end=4');
  await page.locator('.quiz-choice').first().waitFor({ timeout: 30000 });
  ok(await page.locator('.quiz').getAttribute('data-source') === 'blank', 'AI down: trivia uses fill-in-the-blank from the verses');
  await page.locator('.quiz-choice').first().click();
  ok((await page.locator('.verse-card').innerText()).includes('Psalm 23:'), 'trivia shows the verse after an answer');
  await audit(page, 'trivia (answer shown)');
  ok(!(await page.locator('body').innerText()).match(/wrong|score|incorrect/i), 'no "wrong" or score language');
  await context.close();
}

// ---------- 5. Trivia validator drops a fabricated answer ----------
{
  const { context, page } = await fresh();
  // Two real questions made from the verse text the app sends, plus one whose answer is
  // nowhere in the passage. Only the two real ones may be shown.
  await page.route('**/functions/v1/curate', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action !== 'trivia') return route.continue();
    const words = (v) => v.text.split(/[^A-Za-z]+/).filter((w) => w.length > 4);
    const real = body.verses.slice(0, 2).map((v) => ({ q: `Which word is in verse ${v.num}?`, answer: words(v)[0], choices: [words(v)[0], 'Zzyzx', 'Qwfpg'], verse: v.num }));
    const fake = { q: 'FABRICATED question?', answer: 'Xylophone', choices: ['Xylophone', 'Zzyzx'], verse: body.verses[0].num };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions: [real[0], fake, real[1]], source: 'ai' }) });
  });
  await page.goto(BASE + '#/game/trivia?book=PSA&chapter=23&start=1&end=4');
  await page.locator('.quiz-choice').first().waitFor({ timeout: 30000 });
  ok(await page.locator('.quiz').getAttribute('data-source') === 'ai', 'valid AI questions are used');
  const titles = [];
  for (let i = 0; i < 4; i++) {
    titles.push(await page.locator('.trivia-q').innerText());
    await page.locator('.quiz-choice').first().click();
    const next = page.getByRole('button', { name: /Next question|All done/ });
    const label = await next.innerText();
    await next.click();
    if (label === 'All done') break;
  }
  ok(titles.length === 2 && !titles.some((t) => t.includes('FABRICATED')), `fabricated answer dropped (${titles.length} questions shown)`);
  await context.close();
}

// ---------- 6. Word search, crossword, prayers: playable + axe ----------
{
  const { context, page } = await fresh();
  await page.goto(BASE + '#/game/word-search?book=PSA&chapter=23&start=1&end=6');
  await page.locator('.ws-cell').first().waitFor({ timeout: 30000 });
  ok((await page.locator('.ws-cell').count()) === 36, 'word search easy: 6x6');
  // Solve the first word: the hint lights its first letter; find its last letter by spelling.
  await page.getByRole('button', { name: 'Show me a word' }).click();
  const solved = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.ws-cell')];
    const size = Math.round(Math.sqrt(cells.length));
    const word = document.querySelector('.ws-bank li:not(.found)').textContent.trim();
    const start = cells.findIndex((c) => c.classList.contains('hint'));
    const r0 = Math.floor(start / size), c0 = start % size;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1]]) {
      const end = [r0 + dr * (word.length - 1), c0 + dc * (word.length - 1)];
      if (end[0] >= size || end[1] >= size) continue;
      const spelled = [...word].map((_, i) => cells[(r0 + dr * i) * size + c0 + dc * i].textContent).join('');
      if (spelled === word) { cells[start].click(); cells[end[0] * size + end[1]].click(); return word; }
    }
    return null;
  });
  ok(solved && (await page.locator('.ws-bank li.found').count()) === 1, `word search: found ${solved} by tapping first and last letters`);
  await audit(page, 'word search');
  await page.goto(BASE + '#/game/crossword?book=PSA&chapter=23&start=1&end=6');
  await page.locator('.cw-clue').first().waitFor({ timeout: 30000 });
  const clues = await page.locator('.cw-clue').count();
  ok(clues >= 4 && clues <= 6, `crossword: ${clues} clues`);
  ok((await page.locator('.cw-clue').first().innerText()).includes('_'), 'crossword clue is the verse with the word blanked');
  await page.getByRole('button', { name: 'Show the word' }).click();
  ok((await page.locator('.game-status').innerText()).startsWith('The word is'), 'crossword: Show the word');
  await audit(page, 'crossword');
  await page.goto(BASE + '#/prayers'); await page.locator('.study-tile').first().waitFor({ timeout: 20000 });
  await audit(page, 'prayers');
  await page.goto(BASE + '#/aide'); await page.getByRole('radiogroup', { name: 'Show AI reasoning' }).waitFor();
  await audit(page, 'aide tools');
  await context.close();
}

ok(issues.length === 0, `axe: 0 issues on new screens ${issues.length ? JSON.stringify(issues) : ''}`);
// The AI-down block's 500s are logged by the browser itself; anything else is a real error.
const real = errors.filter((e) => !/status of 500/.test(e));
ok(real.length === 0, 'no console errors ' + JSON.stringify(real));
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exitCode = fail ? 1 : 0;
