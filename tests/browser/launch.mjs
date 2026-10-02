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
