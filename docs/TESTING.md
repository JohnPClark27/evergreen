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
| End-to-end walk at iPad size (1180×820), first-time user, big buttons only | `tests/browser/e2e.mjs` | see the `studio` branch results below |
| Studio security as real users (author A, author B, admin), incl. studies inside plans | `python supabase/tests/studio_rls_test.py` | 39/39 pass |
| Tablet: plan list, plan page (Start / Continue, ✓, Next up, Start over), study 1 using **every module type**, read-aloud Off by default + switching On/Off, done → Next: Study 2, all done (+ axe on plan page, quiz, Aide tools) | `tests/browser/studies.mjs` (+ `fixture_all_modules.py`) | 32/32 pass |
| Studio end to end: author builds, reorders, adds/copies/removes studies, previews a study, submits; admin approves; tablet lists it with both studies; PD rule refuses #8; axe on every Studio page | `tests/browser/studio.mjs` (+ `studio_users.py make`) | 36/36 pass |
| Studio sign-in: link opened in a *different* browser, one-time code, expired link | `tests/browser/signin.mjs` (+ `studio_users.py link`, no email sent) | 6/6 pass |
| Accessibility (axe-core 4.13: WCAG 2.0/2.1/2.2 A+AA and best practice) | axe on 14 screen states: Home, plan list, plan page, study (hymn with word lit, sheet music, scripture with verse lit, prayer), Finished, Sing grid, Sing player, Aide tools, confirm dialog, Read the Bible, Tap to continue | 0 issues |
| Keyboard | Tab through Home; Enter on a tile starts the session | Tab order: 3 tiles, then Aide tools. Every stop shows a 4 px outline |
| Portrait (820×1180) | e2e | no sideways scrolling |

**The e2e walk:**
1. Home, then *Choose a Study Plan*, then a plan ("0 of N done"), then **Start: Study 1**: the
   hymn plays and a word is highlighted.
2. Next through every part: Scripture shows the YouVersion attribution. Finish.
3. *Enjoyed it* is saved to `localStorage`. *Back to the plan* shows "1 of N done", and the plan is
   listed first with "Enjoyed before".
4. *Sing a Hymn*: a 3×3 grid, then singing works.
5. A reload mid-study resumes at the same part. Portrait has no sideways scroll. The console has no
   errors.

(Runs on the `ZZ All modules` test plan from `fixture_all_modules.py` when it exists, else the first plan.)

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

See `tests/browser/README.md`:
```sh
cd tests/browser && npm install && ./setup-libs.sh
node e2e.mjs  https://dev.hymnal-reader-v2.pages.dev/ reduce
node a11y.mjs https://dev.hymnal-reader-v2.pages.dev/
```

---

## 2. Manual checklist (real devices)

Use an **iPad with Safari** (primary) and one desktop Chrome. Tick each item. A failure: note
the device, iOS version, and what happened.

### A. First tap: sound and speech unlock (iPad)
- [ ] Open the app fresh (new tab). Tap **Choose a Study Plan**, a plan, then **Start: Study 1**. Music starts within about 2 s.
- [ ] The **ringer/mute switch** (or Control Center silent mode): with it ON, does the music still
      play? On some iPads, Web Audio follows the silent switch. Note the result. Aides need to
      know to turn it off.
- [ ] Open a deep link directly (e.g. `…/#/study/<plan>/1`). It shows **Tap to continue**, and one tap
      starts the music.
- [ ] Go to Scripture. **Read aloud** is *Off* by default (top of the study): the text shows, with no voice and no "Reading aloud" badge.
- [ ] Tap **Read aloud: Off** → **On**. The **voice reads** each verse and the current verse is highlighted. Go to another study: it stays On (saved on the tablet). Aide tools shows the same switch.
- [ ] Aide tools → **Test voice** speaks. The voice list shows only on-device voices.

### B. Ducking (with read-aloud switched On)
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
- [ ] In the Studio (admin) → Hymns, unpublish one hymn.
- [ ] **Refresh** the public app. The hymn is gone from Sing a Hymn.
- [ ] Publish it again and refresh. It's back. Both changes show in the Audit Log.

### K. Studio (any laptop or iPad browser)
- [ ] `/studio/` → enter your email → the sign-in email arrives (built-in sender: about 2 per hour) → open its link **on a different device or browser** → you're signed in.
- [ ] New study plan. In Study 1: hymn, hymn, Scripture, your own note, a quiz, a hymn. Reorder by dragging and with ▲ ▼.
- [ ] **+ Add a study** (Study 2) with a few modules, and **Copy a study from another plan**. Rename studies and move them up or down. Save.
- [ ] An empty study stops *Submit for review*, and the list under the buttons says which study.
- [ ] **Preview study N** plays the selected study exactly like a tablet ("Study 1 of 2" top right). Close returns to the editor.
- [ ] Submit for review. As an admin: Review → open it → Approve. It appears on the tablet's **Choose a Study Plan**, and its page lists every study.
- [ ] On the tablet: finish Study 1. The done screen offers **Next: Study 2**, and the plan page shows ✓ Study 1 and **Continue: Study 2**. Reload: the ✓ is still there. **Start this plan over** clears it (after a confirm).
- [ ] Send one back with a note: the author sees the note and can edit again.
- [ ] Hymns: publishing a hymn that isn't fully public domain per its file is refused, with the reason.

### J. Production smoke test (after merging to `main`)
- [ ] `https://hymnal-reader-v2.pages.dev/` shows **Welcome.** (not "coming soon").
- [ ] Day 1 runs end to end, Scripture loads (the Edge Function accepts the production origin),
      and a hymn plays in Sing a Hymn.
