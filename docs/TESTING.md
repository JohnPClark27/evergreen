# Testing

Two parts:
1. **Automated checks** I can run headless. Their latest results are recorded below.
2. **The manual checklist** for real devices. Speech, iPad audio rules and VoiceOver can't be
   checked headless: the headless browser has no voices and isn't Safari.

Test on the **Pages preview** (`https://dev.hymnal-reader-v2.pages.dev/`) before merging, and on
**production** (`https://hymnal-reader-v2.pages.dev/`) after.

---

## 1. Automated checks

| Check | How | Latest result (2026-10-02) |
|---|---|---|
| RLS: the public key reads published rows only and can't write | `bash supabase/tests/rls_anon_test.sh` | 19/19 pass |
| Edge Function logic (refs, CORS, rate-limit keys, cache) | `node supabase/functions/youversion/test.ts` | 22/22 pass |
| Edge Function live | `curl "…/functions/v1/youversion?book=PSA&chapter=23&start=1&end=3"` | 200, Psalm 23:1-3 + attribution. Bad refs give 400. 61st request in a minute gives 429 |
| End-to-end walk at iPad size (1180×820), first-time user, big buttons only | Playwright script (see below) | 13/13 pass, also with reduced motion on |
| Accessibility (axe-core 4.13: WCAG 2.0/2.1/2.2 A+AA and best practice) | axe on 12 screen states: Home, Session (hymn with word lit, sheet music, scripture with verse lit, prayer), Finished, Sing grid, Sing player, Aide tools, confirm dialog, Read the Bible, Tap to continue | 0 issues |
| Keyboard | Tab through Home; Enter on a tile starts the session | Tab order: 3 tiles, then Aide tools. Every stop shows a 4 px outline |
| Portrait (820×1180) | e2e | no sideways scrolling |

**The e2e walk:**
1. Home, then *Today's Hymn & Verse*: Day 1 of 12, the hymn plays, and a word is highlighted.
2. Next: Scripture with the YouVersion attribution. Next: the prayer with its source.
3. Finish: "Day 2 will be ready next time". *Enjoyed it* is saved to `localStorage`.
4. Home, then *Sing a Hymn*: a 3×3 grid with the enjoyed hymn first, then singing works.
5. A reload resumes Day 2. Portrait has no sideways scroll. The console has no errors.

### Contrast (design tokens, WCAG ratios)

| Pair | Ratio | Needs |
|---|---|---|
| Ink on paper / surface | 14.96 / 16.29 | 4.5 (AA text) |
| Muted text on paper / surface (captions, sung words) | 6.93 / 7.55 | 4.5 |
| Ink on highlight (current word / verse) | 12.81 | 4.5 |
| White on burgundy (primary buttons, tiles) | 9.81 | 4.5 |
| Burgundy on accent-soft (badge, tag, current step) | 7.86 | 4.5 |
| Burgundy focus ring on surface | 9.65 | 3 (non-text) |
| Control outlines (`--control-border` #958873) on paper | 3.14 | 3 (non-text, WCAG 1.4.11) |

The spec's `#CFC3AE` border (1.57:1) is kept only for decorative dividers. Buttons, tiles and
inputs use `--control-border`, so their edges are visible to low-vision users.

### Running the browser checks

The browser tests aren't in the repo yet, because they need two dev-only packages
(`playwright-core`, `axe-core`). See `CLAUDE.md` §7 for the recipe:
- a scratchpad install
- `libnss3`/`libnspr4` via `apt-get download` + `dpkg -x` (no sudo)
- `python3 -m http.server 8080` in `web/`

---

## 2. Manual checklist (real devices)

Use an **iPad with Safari** (primary) and one desktop Chrome. Tick each item. A failure: note
the device, iOS version, and what happened.

### A. First tap: sound and speech unlock (iPad)
- [ ] Open the app fresh (new tab). Tap **Today's Hymn & Verse**. Music starts within about 2 s.
- [ ] The **ringer/mute switch** (or Control Center silent mode): with it ON, does the music still
      play? On some iPads, Web Audio follows the silent switch. Note the result. Aides need to
      know to turn it off.
- [ ] Open a deep link directly (e.g. `…/#/session`). It shows **Tap to continue**, and one tap
      starts the music.
- [ ] Go to Scripture. The **voice reads** each verse, and the current verse is highlighted.
- [ ] Aide tools → **Test voice** speaks. The voice list shows only on-device voices.

### B. Ducking
- [ ] On Scripture, the music keeps playing softly and **drops clearly** while the voice reads.
- [ ] After the last verse, the music **comes back up** within about 1 s.
- [ ] Same on the Prayer step, line by line.

### C. Pause, resume, read again
- [ ] Hymn step: **Pause** stops music and highlighting; **Play** continues from the same place.
- [ ] Scripture: **Pause** mid-verse stops the voice; **Play** re-reads that verse from its start.
- [ ] **Read again** starts the passage over. **Sing again** restarts the hymn.
- [ ] Back and Next never leave two sounds playing at once.

### D. Resume and sleep
- [ ] Mid-session (e.g. on Scripture), reload the page. It shows **Tap to continue**, then the same
      day and step.
- [ ] Lock the iPad for 1 min mid-hymn, then unlock. One tap resumes the sound.
- [ ] Finish Day 1, close the tab, and reopen it. The Home tile says **Day 2**.
- [ ] Finish the last day of the plan. The next time it shows Day 1 (the plan starts over).

### E. Simple mode (resident with aide)
- [ ] Every action on Home, Session, Finished and Sing a Hymn works with **big buttons only**.
      No typing, no small targets.
- [ ] The text is easy to read at arm's length: session text is 28 px or more, lyrics 32 px.
- [ ] Nothing moves or changes music unless someone taps. There's no auto-advance, and scrolling
      changes nothing in a session.
- [ ] No streaks, scores, badges or "missed a day" messages anywhere.
- [ ] Portrait (rotate the iPad): every screen still fits, and buttons stay large.

### F. Notes and privacy
- [ ] Finished → **Enjoyed it**: the hymn shows first in Sing a Hymn with "Enjoyed before".
- [ ] **Skip next time**: the hymn is hidden in Sing a Hymn.
- [ ] Aide tools → **Reset hymn notes…** asks to confirm, then clears both.
- [ ] Aide tools shows "Notes stay on this tablet. No names are saved."

### G. Read the Bible
- [ ] Pick a book and chapter. The text is large, and **Read aloud** highlights each verse.
- [ ] "Play a matching hymn quietly" is **off** by default. Turned on, for Psalm 23, a hymn plays softly.
- [ ] "Change hymn as I scroll" is **off** by default and only usable when music is on.

### H. Accessibility spot checks
- [ ] iPad **VoiceOver**: each screen announces its heading. Buttons have clear names (Home,
      Back, Pause/Play, Next).
- [ ] iPad Settings → Accessibility → **Reduce Motion** on: no smooth scrolling or sliding highlights.
- [ ] Desktop: the whole flow works with **Tab / Shift-Tab / Enter / Space**, and focus is always visible.
- [ ] Browser zoom 200%: text grows and nothing important is cut off.

### I. Admin → public (end-to-end publishing)
- [ ] In the admin app, unpublish one hymn (status → approved) and save.
- [ ] **Refresh** the public app. The hymn is gone from Sing a Hymn.
- [ ] Publish it again and refresh. It's back. Both changes show in the Audit Log.

### J. Production smoke test (after merging to `main`)
- [ ] `https://hymnal-reader-v2.pages.dev/` shows **Welcome.** (not "coming soon").
- [ ] Day 1 runs end to end, Scripture loads (the Edge Function accepts the production origin),
      and a hymn plays in Sing a Hymn.
