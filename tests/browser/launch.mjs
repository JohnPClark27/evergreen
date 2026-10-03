// launch.mjs - start a headless Chromium for the checks, without sudo.
//
// Uses (in order): $CHROME_PATH, else Playwright's cached chrome-headless-shell
// (~/.cache/ms-playwright/chromium_headless_shell-*). Missing system libraries (libnss3,
// libnspr4 on a bare WSL) come from ./.libs, filled by ./setup-libs.sh (apt-get download,
// no root needed).
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function headlessShell() {
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    const exe = join(cache, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

export function launch() {
  const libs = new URL('./.libs/root/usr/lib/x86_64-linux-gnu', import.meta.url).pathname;
  const env = existsSync(libs) ? { ...process.env, LD_LIBRARY_PATH: libs } : process.env;
  const executablePath = process.env.CHROME_PATH ?? headlessShell();
  if (!executablePath) {
    throw new Error('No browser found: set CHROME_PATH, or run `npx playwright-core install chromium-headless-shell`.');
  }
  return chromium.launch({ executablePath, env, args: ['--autoplay-policy=no-user-gesture-required'] });
}

/** Base URL from argv[2]; default is the local server (`python3 -m http.server 8080` in web/). */
export const BASE = process.argv[2] ?? 'http://localhost:8080/';

/** Run axe-core (WCAG 2.0/2.1/2.2 A+AA + best practice) on the page; returns ['rule (n): help', …]. */
export async function axe(page) {
  const { readFileSync } = await import('node:fs');
  await page.addScriptTag({ content: readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });
  const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
  return r.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help} e.g. ${v.nodes[0].target.join(' ')}`);
}
