// a11y.mjs - axe-core (WCAG 2.0/2.1/2.2 A+AA + best practice) on 12 screen states, plus a
// keyboard tab-order check on Home. Usage: node a11y.mjs [baseUrl] [WIDTHxHEIGHT]
// (default 1180x820 = iPad; e.g. 390x844 checks the phone layout)
import { BASE, launch } from './launch.mjs';
import { readFileSync } from 'node:fs';
const AXE = readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const browser = await launch();
const [width, height] = (process.argv[3] ?? '1180x820').split('x').map(Number);
const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
const all = new Map();
async function audit(name) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  const v = r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, help: x.help, eg: x.nodes[0].target.join(' ') + ' :: ' + (x.nodes[0].failureSummary ?? '').split('\n').slice(1, 2).join('') }));
  console.log(`\n[${name}] ${v.length ? v.length + ' issue type(s)' : 'clean'}`);
  for (const x of v) { console.log(`  ${x.impact} ${x.id} (${x.n}): ${x.help}\n     e.g. ${x.eg.slice(0, 220)}`); all.set(x.id, (all.get(x.id) ?? 0) + x.n); }
}
await page.goto(BASE); await page.getByRole('heading', { name: 'Welcome.' }).waitFor(); await page.waitForTimeout(600); 
await audit('home');
// keyboard: tab through home; every stop must show a visible focus outline
const stops = [];
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('Tab');
  stops.push(await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return `${e.tagName}:${(e.textContent || '').trim().slice(0, 22)} outline=${s.outlineStyle}/${s.outlineWidth}`; }));
}
console.log('\nkeyboard tab order (home):\n  ' + stops.join('\n  '));
console.log('Enter on:', await page.evaluate(() => document.activeElement.textContent.trim().slice(0, 25)));
await page.keyboard.press('Enter'); // activates "Today's Hymn & Verse" by keyboard
await page.locator('.lyric-word').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(8000);
await audit('session: hymn (word highlighted)');
await page.getByRole('button', { name: 'Show sheet music' }).click(); await page.locator('.sheet svg').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(2500);
await audit('session: sheet music');
await page.getByRole('button', { name: 'Next' }).click(); await page.locator('.read-line').first().waitFor({ timeout: 30000 });
await page.evaluate(() => document.querySelectorAll('.read-line')[1].classList.add('reading'));
await audit('session: scripture (verse highlighted)');
await page.getByRole('button', { name: 'Next' }).click(); await page.locator('.reading-panel.centered').waitFor();
await audit('session: prayer');
await page.getByRole('button', { name: 'Finish' }).click(); await page.getByRole('heading', { name: /session/ }).waitFor();
await audit('finished');
await page.getByRole('button', { name: 'Sing another hymn' }).click(); await page.locator('.hymn-tile').first().waitFor();
await audit('sing: grid');
await page.locator('.hymn-tile').first().click(); await page.locator('.lyric-word').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(3000);
await audit('sing: player');
await page.goto(BASE + '#/aide'); await page.locator('.day-btn').first().waitFor();
await audit('aide tools');
await page.getByRole('button', { name: /Reset hymn notes/ }).click(); await page.locator('dialog[open]').waitFor();
await audit('aide: confirm dialog');
await page.keyboard.press('Escape');
await page.goto(BASE + '#/read'); await page.waitForTimeout(400);
if (await page.getByRole('button', { name: 'Tap to continue' }).count()) await page.getByRole('button', { name: 'Tap to continue' }).click();
await page.locator('.bible .read-line').first().waitFor({ timeout: 30000 });
await audit('read the bible');
await page.goto(BASE + '#/session'); await page.reload(); await page.getByRole('button', { name: 'Tap to continue' }).waitFor();
await audit('tap to continue');
console.log('\nTOTAL by rule:', JSON.stringify(Object.fromEntries(all)));
await browser.close();
