# Browser checks (dev-only)

End-to-end and accessibility checks for the public app. They use two **dev-only** packages
(`playwright-core`, `axe-core`), pinned in `package.json`. Nothing here ships to `web/` or `admin/`.

```sh
cd tests/browser
npm install                 # once
./setup-libs.sh             # once, on a bare Ubuntu/WSL: fetches libnss3/libnspr4 without sudo
npx playwright-core install chromium-headless-shell   # only if no headless shell is cached yet

# against the preview (or production)
node e2e.mjs  https://dev.hymnal-reader-v2.pages.dev/          # add "reduce" for reduced motion
node a11y.mjs https://dev.hymnal-reader-v2.pages.dev/

# against a local copy: (cd ../../web && python3 -m http.server 8080 --bind 127.0.0.1)
node e2e.mjs
```

- **`e2e.mjs`:** a first-time user at iPad size (1180×820), big buttons only. It runs Day 1 end to
  end (hymn with highlighted words, Scripture with attribution, prayer with its source), Finish,
  *Enjoyed it*, Sing a Hymn, reload-resume, and portrait. It fails on any console error.
- **`a11y.mjs`:** axe-core (WCAG 2.0/2.1/2.2 A+AA + best practice) on 12 screen states, plus the
  keyboard tab order on Home.

The headless browser has **no speech voices**, so reading aloud runs silently. Real speech is
checked by hand (`docs/TESTING.md` section 2).
