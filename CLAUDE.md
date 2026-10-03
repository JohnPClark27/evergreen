# Hymnal Reader v2: agent handoff

Read this first. It's the shared state for every agent working in this repo: what's done,
what's live, the rules, and how to avoid stepping on each other. The full spec is
`docs/PLAN_PROMPT.md` (phases 0–9). The approved design is `docs/PLAN.md`, and the runbook is
`docs/DEPLOY.md`.

**Status (2026-10-02): all phases (0–9) are done.**
- Production is live at `https://hymnal-reader-v2.pages.dev/`: PR #1 merged `dev` → `main`, and the
  production smoke test gave e2e 12/12 and axe 0 issues.
- The Phase 9 docs (README for judges, `docs/VALIDATION.md` template, known gaps) are on `dev` and
  reach `main` when the user merges.
- Still pending, by people: the real-device checklist in `docs/TESTING.md` §2 (speech on iPad, mute
  switch, VoiceOver), filling in `docs/VALIDATION.md`, and the "Known gaps" list in `README.md`.
  That list is the backlog for any further work.

## 0. The `studio` branch (2026-10-02), read this if you're on it

The user asked to **replace the Python admin app with a web Studio** that anyone can sign in to,
and to **rework studies into modular study plans**. Built on branch `studio` (not merged; the user
merges). Decisions the user made: **admin approval** before plans reach tablets, **magic-link**
sign-in, tablets list **all approved plans**, quizzes are **gentle, with no scoring**.

- **Plans hold studies (2026-10-03, user's request):** a **study plan** (published by a pastor,
  approved as a whole) holds one or more **studies**; each study holds modules. The user chose:
  studies live **inside one plan** (with "copy a study from another plan"); tablets let people
  open studies in **any order** with a "Next up" suggestion; the 12 imported days were
  **combined** into one DRAFT plan "Sample — 12 Days" (12 studies), and the old 12 one-study
  plans were archived (not deleted). Migration `0008_plan_studies`.
- **Data (migrations 0005–0008, additive only; `main` still reads `plans/plan_days/studies`):**
  - `profiles` (author/admin, created on sign-up)
  - `study_plans` (owner, status draft → pending → published | archived, review_note) and
    `plan_studies` (plan_id, position, title) and `study_plan_items` (plan_id, **study_id**,
    position, `module_type`, jsonb `config`; FK `(study_id, plan_id)` → `plan_studies`)
  - RLS and a status-guard trigger: authors can't publish
  - `module_config_ok()`: the DB refuses Scripture or prayer text in modules
  - RPCs `save_study_plan` (atomic), `study_plan_problems`, `review_study_plan`, `admin_list_users`,
    `set_user_role`
  - audit triggers log the signer's email
  - `save_study_plan(p_id, p_title, p_description, p_studies)` with
    `p_studies = [{title, items: [{type, config}]}]`.
  - `study_plan_problems` reports per study: "Study 3 … has no modules", "Study 2, module 1:
    hymn #… isn't published".
- **Modules:** `web/modules/*.js` with registry `web/modules/index.js`. See `docs/MODULES.md`.
  Adding one = one file + one line.
- **Runner:** `web/js/runner.js` plays one STUDY (`{title, subtitle, items}`). The tablet uses it at
  `#/study/<planId>/<n>` (n = 1-based study number); the Studio
  previews through the tablet's `#/preview` in an iframe, with the plan passed in `sessionStorage`
  under `hr.preview`.
- **Tablet:** Home → **Choose a Study Plan** (`#/studies`) → plan page (`#/plan/<id>`: Start /
  Continue: Study N, ✓ rows, Next up, Start this plan over) → study (`#/study/<id>/<n>`) → done
  ("Next: Study N" / Back to the plan / Home). Progress: `hr.planProgress {[planId]: {done:
  [studyKey], last, date}}`, where studyKey = the study's title in lower case, so a ✓ survives the
  pastor re-saving or reordering. Old `#/study/<id>` links redirect to `#/plan/<id>`. The day picker
  and `#/session` are gone (`#/session` redirects).
- **Studio:** `web/studio/` (`js/db.js` is its only Supabase module).
  - Pages: plans, editor, review, hymns (publishing re-runs the PD rule from the ABC file:
    `js/pd.js`, which agrees with the Python rule on all 301 files), prayers, people, audit,
    account.
  - Auth uses the **implicit** flow: the link returns `#access_token=…`, and `app.js` lets supabase-js
    read it, then rewrites the address to `#/plans` before routing.
  - **PKCE was tried first and broke real sign-ins:** its links only work in the browser that
    requested them (the user's account was confirmed but never signed in).
  - `#error=…otp_expired` shows a friendly message.
- **Removed:** `admin/` (PySide6), `supabase/seed/seed_plan.py` and `memory_care_30.json`.
  - Pipeline scripts read `.env` in the repo root, falling back to `admin/.env`.
  - `publish_pd_hymns.py` uses `pipeline/supa.py`.
- **Auth config (set via the Management API):**
  - site URL `https://hymnal-reader-v2.pages.dev/studio/`
  - redirect allow-list: Pages production, `*.hymnal-reader-v2.pages.dev`, localhost:8080
  - The built-in email sender is limited to **2/hour**; custom SMTP is recommended
    (`docs/DEPLOY.md` A6b).
  - Email templates are **locked on the Free tier** without custom SMTP, so emails contain a
    link only.
  - `python pipeline/studio_signin.py <email> [--admin] [--url …]` makes a one-time link + code
    with no email sent (never rate-limited). Use it for the first admin and for anyone locked out.
  - Supabase keeps **one** pending sign-in token per user: generating a new one cancels the old.
- **Tests** (all re-run green on the `studio` preview, 2026-10-03):
  - `python supabase/tests/studio_rls_test.py` (39). Counts come from the live data, because
    admins publish and unpublish plans; don't hard-code them.
  - `tests/browser/studio.mjs` + `studio_users.py` (36, including studies and axe on Studio pages)
  - `studies.mjs` + `fixture_all_modules.py` (27; the fixture is a published 2-study plan). Run
    `make` first and `clean` after, e.g. with a shell `trap` that uses **absolute** paths.
  - In Playwright, match "Next" with `exact: true`: the finish-the-line game has a "Next line"
    button. Dialogs' `close` events arrive asynchronously, so wait for the result before counting.
  - `e2e.mjs` (14) and `a11y.mjs` (13 tablet states), updated for studies
  - `signin.mjs` + `studio_users.py link` (6: link in a fresh browser, code, expired link)
- **Another session** works on branch `mobile-layout` (worktree `.claude/worktrees/`, now
  gitignored; never commit it). It was told which files `studio` changed. Expect merge overlap in
  `web/css/app.css` and `web/js/screens/*`.

---

## 1. Coordination rules (avoid clashing)

1. **Before you start:** `git fetch && git status && git log --oneline -5` on `dev`. If `dev`
   has moved, pull first. Never work from a stale checkout.
2. **One phase at a time, in order.** The user says "go" to start each phase. At the end of a
   phase: commit (`phase N: …`), push, summarize, and **stop**. Don't start the next phase
   uninvited.
3. **Branch `dev` only.** Never commit to `main`, never force-push, never merge (the user merges).
   If two agents must work in parallel, each uses its own branch off `dev` (e.g.
   `phase6-audio`) and touches **disjoint files**. See the ownership table in §6.
4. **Migrations are append-only.** Never edit an applied migration. The next file is
   `supabase/migrations/20261001000009_<name>.sql` (0005–0008 are used by `studio`). Pick the next free number after `git pull`;
   two agents must not pick the same number. Apply with `npx supabase db push`.
5. **Update this file** at the end of your phase: the status line, §3 "Live state", and anything
   you learned in §8. Keep it accurate. It's how the next agent avoids redoing or breaking your work.
6. **Shared hosted DB:** there is only one database (no local stack). Tests that write must
   clean up after themselves (see §7). Never run one-time seeds twice (§4).

## 2. The user's standing rules (non-negotiable)

- **Supabase CLI:** always `npx supabase …` (it's not on PATH). **Hosted only:** never
  `supabase start`, local `db reset`, or anything needing Docker. Functions deploy with
  `--use-api`.
- **No `sudo`, ever.** Anything that needs root goes in `setup.sh`, which the user runs.
- **Secrets:** never print, cat, echo, or commit `.env` / `admin/.env` (they hold the service role key).
  Check key *names* only (`grep -q '^KEY=.' admin/.env`). `supabase secrets list`: print names only.
- **Service role key:** only in pipeline/seed/test scripts (from `.env`). Never in `web/` (the Studio signs people in),
  never in Edge Functions, never in git. The public app uses the publishable key in
  `web/config.js` (safe to publish, already committed).
- **Content integrity:** never write prayers, Scripture, or theological text. Prayers come only
  from Open Prayer Book (importer) or the Studio's Prayers page (admins) with a required `source`.
  Authors' own notes and quizzes are their words; admin review gates them. Scripture comes
  from YouVersion at runtime: **never store verse text** (no DB columns, seeds, fixtures, or
  hardcoded text). Always show the YouVersion attribution with Scripture and the source with
  each prayer.
- **Privacy:** no *resident* accounts or personal data; progress only in `localStorage`. Only Studio
  *authors* sign in (approved by the user, 2026-10-02). **No engagement
  mechanics** (streaks, badges, scores, "you missed a day"). **No medical claims.**
- **Audio:** browser Web Speech API with system voices only. No cloud TTS, no AI audio/music/art.
- **Dependencies:** only those in the plan. Anything new needs a one-line justification, and you
  must **ask first**.
- **Ask when it's ambiguous.** The user is a student: short comments where logic isn't obvious,
  simple readable code.
- Commit messages end with `Co-Authored-By: Claude …` (per the harness attribution rule).

## 3. Live state (hosted)

| Thing | Value |
|---|---|
| Supabase project | ref `trdmlfbbmxogrxihcklw`, URL `https://trdmlfbbmxogrxihcklw.supabase.co` (Free tier) |
| Publishable key | in `web/config.js` (`window.HYMNAL_CONFIG.supabaseUrl / supabaseAnonKey`) |
| GitHub | `JohnPClark27/hymnal-reader-v2`, branch `dev` |
| Cloudflare Pages | output `web/`, no build. Preview: `https://dev.hymnal-reader-v2.pages.dev/` (production `hymnal-reader-v2.pages.dev`). `/` is the real app (Phase 7). Phase 6 test page: `/dev/core-test`. Pages serves clean URLs: `x.html` 308-redirects to `x`. |
| DB content | 301 hymns: **40 `published`** (well-known, fully public domain per a strict ABC-file rule: `supabase/seed/publish_pd_hymns.py`), the rest `approved`. 50 `is_familiar` (the original 46 plus #67, #83, #169, #170, set in the DB; `familiar.txt` only seeds first imports). 1313 scripture refs, 158 topics, 15 prayers (`published`). Plans: **"Sample — 12 Days" (`published`**, 12 published studies) and "Memory Care — 30 Days" (`draft`; 4 of its studies are shared with the sample plan and are published). |
| Storage | public buckets `hymn-abc`, `hymn-audio`, `hymn-timings`, about 107 MB total. Audio only for the 50 familiar hymns, so every published hymn has audio. |
| Edge Function | `youversion` deployed (`--no-verify-jwt`). Secret `YOUVERSION_API_KEY` is set (by the user). |
| Migrations applied | `…0001_schema`, `…0002_rls`, `…0003_storage_buckets`, `…0004_rate_limits`, plus the Studio's `…0005`–`…0007` (additive; checked 2026-10-03) |
| Studio data (2026-10-03, after 0008) | 1 user (the owner, **admin**). Active plans: the owner's **"Sample Study Plan"** (published, 1 study, all six module types) and **"Sample — 12 Days"** (**published** 2026-10-03 at the owner's request: 12 studies, 36 modules; the problems check was empty; the status change is in the Audit Log as `claude-on-owner-request`). The 12 old one-study plans are archived. **Real content: don't change it in tests.** |

**The public app sees: 40 hymns, 15 prayers, and the published "Sample — 12 Days" plan.** That's
enough for Phase 7's session flow. For testing Phase 6/7 you'll need published content. Ask the user to publish
(or, if they agree, publish via `admin/data.py` and record what you changed so it can be reverted).

## 4. Don't re-run / don't change

- `supabase/seed/seed_plan.py`: refuses to run if a plan with the same title exists. Don't delete
  plans to re-seed. Already run for "Memory Care — 30 Days" (draft) and
  `--title "Sample — 12 Days" --days 12 --publish`.
- **Public-domain rule** for publishing hymns (user requirement: fully PD per the ABC file):
  `supabase/seed/publish_pd_hymns.py`.
  - A hymn qualifies if its file has a `C: copyright: public domain` line and no credit line citing a
    source or setting from 1928 or later, and the claim doesn't rest on "never renewed".
  - An explicit arranger dedication to the public domain also qualifies.
  - This excluded 10 familiar hymns, e.g. ones transcribed from *Lutheran Worship* (1982).
  - Publish new hymns only if they pass this rule.
- **Hymn numbers** (1–301 = sorted source path, the same as v1 ids) are stable keys used in Storage
  object names. The importer never renumbers. Don't either.
- `pipeline/render_mp3.sh` steps up to the WAV must stay identical: the lyric timings rebuild the
  same MIDI. Only the LAME settings may change (`MP3_BITRATE_KBPS`).
- `pipeline/timings/build_timings.mjs` uses **abcjs** on purpose: the browser sheet-music cursor
  must use abcjs too, so `noteTimes[stanza][j]` maps to melody note `j` on screen. Don't swap
  parsers.
- Re-importing is safe and idempotent (`python pipeline/import_hymns.py`): it skips unchanged
  files by hash and never touches `status`, `is_familiar`, `notes`, or `number`.

## 5. Architecture and data contracts

```
admin/ (PySide6, service role) ──writes──▶ Supabase Postgres + Storage ◀──reads (publishable key)── web/ (static, iPad)
pipeline/ (Python + Node, service role) ──▶        ▲                                                │
                                         Edge Function youversion ◀──── Scripture ──────────────────┘
```

**Tables** (`public`, see `supabase/migrations/`). `status` is the enum `content_status`:
draft/approved/published/archived.
- `hymns(id, number, source_file, title, tune, first_line, meter, stanza_count, abc_path, audio_path, timing_path, file_hashes, timing_verified, is_familiar, status, notes, …)`
- `hymn_scripture_refs(hymn_id, book USFM, chapter, verse_start NULL=whole chapter, verse_end)`, `topics(id, name)`, `hymn_topics(hymn_id, topic_id, stanzas)`
- `prayers(id, slug, title, text, source NOT NULL, section, attribution, status)`
- `studies(id, title, hymn_id, book, chapter, verse_start, verse_end, prayer_id, aide_note ≤280, status)`. A published study must have a hymn and a prayer (check constraint).
- `plans(id, title, description, status)`, `plan_days(plan_id, day_number, study_id)` unique (plan_id, day_number)
- `audit_log(…)`: private. `rate_limits`: private (used by the function only).

**RLS:** anon/authenticated can **select published rows only**. Join tables require a published
parent, and `plan_days` requires both the plan and its study published. There are no write
grants. Test: `bash supabase/tests/rls_anon_test.sh` (19 checks; self-cleaning).

**Storage URLs** (public, `cache-control: max-age=31536000`, CORS `*`, Range supported):
`{SUPABASE_URL}/storage/v1/object/public/{bucket}/{key}`, where the key is the hymn's `abc_path` /
`audio_path` / `timing_path` (e.g. `019-f1dd05d3.mp3`). The hash is in the name, so a changed file
gets a new URL. The MP3s are cross-origin: set `audio.crossOrigin = "anonymous"` before routing
through Web Audio, or you get silence.

**Timing JSON** (`hymn-timings` bucket), per hymn:
```
{ id: number, title, tune, abc: "<original ABC text>", synced: bool, reason?: "why not synced",
  duration, mp3Duration, introEnd,
  stanzas: [{ n, start, end, approx: bool, repeatOf?: idx, lines: [[{ text, t }]] }],  // t = seconds into the MP3
  pages: null | [{ abc, stanzas: [idx] }],   // multi-page sheet music (≤5 stanzas/page)
  noteTimes: [[seconds per written melody note]]  // per stanza pass, aligned with abcjs melody notes
}
```
`synced: false` (only #106 and #263) means: show the words without highlighting. Skip stanzas with
`repeatOf` when listing verses. v1's player logic to port is in `../hymnal-reader-old/public/js/`
(`lyrics.js`, `score.js`, `crossfader.js`). v1 used `SING_LEAD = 0.08` s.

**Edge Function `youversion`:**
```
GET {SUPABASE_URL}/functions/v1/youversion?book=PSA&chapter=23&start=1&end=3   (start/end optional)
200 { reference, book, chapter, verses:[{num,text}], version:{id,abbreviation,title}, attribution, source:"YouVersion" }
400 { error }  bad ref     429 { error } + Retry-After     502 { error: "...(YouVersion <status>)" }
```
No auth header is needed. CORS allows `https://hymnal-reader-v2.pages.dev`, `https://*.hymnal-reader-v2.pages.dev`
and `localhost`/`127.0.0.1` (any port); other browser origins get 403. Rate limit: 60/min per
client, 600/min total (Postgres-backed). Attribution text for ASV: "American Standard Version
(ASV) · Scripture provided by YouVersion." Show it under every passage.

## 6. File map and ownership

| Area | Files | Notes |
|---|---|---|
| Studio (on `studio`) | `web/studio/index.html`, `js/app.js` (router + shell + sign-in), `js/db.js` (**the only Studio module that talks to Supabase**), `js/pages/*.js`, `js/pd.js`, `studio.css` | Replaces the removed PySide6 `admin/` app |
| Modules (on `studio`) | `web/modules/{index,kit,_template,hymn,scripture,prayer,note,quiz,finish-line}.js`, `web/js/runner.js` | `docs/MODULES.md` |
| Pipeline | `pipeline/abc_meta.py`, `render_mp3.sh`, `timings/build_timings.mjs`, `import_hymns.py`, `import_prayers.py`, `supa.py`, `familiar.txt` | Output cache: `pipeline/out/` (gitignored) |
| Supabase | `supabase/migrations/`, `functions/youversion/{index,lib,test}.ts`, `seed/`, `tests/rls_anon_test.sh`, `config.toml` | `node supabase/functions/youversion/test.ts` |
| Public app | `web/index.html` → `js/app.js` (hash router + shared `AudioPlayer`/`Speaker`; routes `#/`, `#/session[?day=N]`, `#/done`, `#/sing[?page=N]`, `#/sing/<number>`, `#/aide`, `#/read`). Screens: `js/screens/{home,session,done,sing,aide,read}.js`. Shared: `js/hymn-panel.js` (title + karaoke + sheet toggle), `js/store.js` (localStorage), `js/ui.js` (`h()`, icons, confirm dialog), `js/books.js`. Styles: `css/core.css` (tokens) + `css/app.css` (screens). Core modules: §9a. | Each screen exports `render(root, params, ctx)` and returns a cleanup function |
| Docs | `docs/PLAN_PROMPT.md` (spec), `PLAN.md`, `DEPLOY.md`, `TESTING.md`, `licenses/` | |
| Browser tests | `tests/browser/{e2e,a11y,launch}.mjs`, `setup-libs.sh` | dev-only (`playwright-core`, `axe-core`) |

Parallel-work guidance (Phase 7): screens are separable by file (Home, Session, Finished, Sing a
Hymn, Aide tools, Read the Bible). Share `web/css/core.css` tokens and the Phase 6 modules. Don't
change module interfaces (§9a) without updating every caller.

## 7. Testing conventions

- **Admin UI tests** run headless: `QT_QPA_PLATFORM=offscreen`, drive the widgets, and take
  `win.grab()` screenshots. **Patch `ui.error` / `ui.confirm`** first, or a modal dialog hangs the
  run forever. Use `python -u` (unbuffered), or prints are lost when a run is killed.
- **Tests that write to the hosted DB:** record `start_id = max(audit_log.id)` first. Afterwards,
  revert the statuses you changed, delete the test rows, and
  `delete from audit_log where id > start_id`. Use obvious names (`ZZ …`, `rls-test-…`). If a run
  dies mid-way, use the audit_log rows to see exactly what to revert.
- Ad-hoc SQL: `npx supabase db query --linked "…"` (Management API; bypasses RLS).
- Every public-app phase is checked on the **Pages preview URL**, not just locally.
- **Browser checks are in the repo:** `tests/browser/` (`e2e.mjs`, `a11y.mjs`, dev-only deps,
  approved by the user). Run `npm install && ./setup-libs.sh` once, then
  `node e2e.mjs <url> [reduce]` / `node a11y.mjs <url>`. Re-run both after any UI change. The
  notes below explain how it works underneath.
- **Browser tests without sudo:** Playwright's cached `chrome-headless-shell` (`~/.cache/ms-playwright/chromium_headless_shell-1243`)
  needs `libnss3`/`libnspr4`. Get them with `apt-get download libnspr4 libnss3`, then `dpkg -x` into the
  scratchpad, then launch with `env.LD_LIBRARY_PATH` pointing there. Install `playwright-core` in the
  scratchpad, not in the repo. Headless has **0 speech voices**: speech "runs" silently, so real
  speech needs a real device. Local serving: `python3 -m http.server 8080 --bind 127.0.0.1` in `web/`
  (localhost is CORS-allowed). Stop it with `pkill -f '[h]ttp.server 8080'`; the bracket stops the
  pattern from matching, and killing, your own shell.

## 8. Lessons learned (gotchas)

- **Hosted Edge Functions get a fresh instance almost every request.** In-memory counters and
  caches don't persist. That's why rate limiting is in Postgres.
- **The `supabase-py` client is not safe to share across threads.** Concurrent calls fail with
  "Server disconnected". All admin background work runs one call at a time under
  `worker.NETWORK_LOCK`. Load related data in **one** worker call to avoid ordering races.
- **The publishable key (`sb_publishable_…`) is not a JWT.** Functions called by the public app
  need `--no-verify-jwt`.
- **Node is installed via nvm** and isn't on PATH in non-interactive shells. `setup.sh` and the
  importer load or find it.
- Some Open Hymnal ABC files are **Windows-1252**. Decode UTF-8 first, then fall back to cp1252.
  They're stored in Storage as UTF-8.
- **Single-stanza audio:** #100 Holy, Holy, Holy and #186 O Come, All Ye Faithful (an Open Hymnal
  expander limit, same as v1).
- **Source data errors** are shown on the admin dashboard: #65 cites 1 Thessalonians 6, which
  doesn't exist; #232 has a reversed verse range.
- **ASV has no copyright text** in YouVersion's metadata, so the attribution falls back to the
  version name.
- **Mono 96 kbps** saves only about 30% against v1. All 301 MP3s would be about 640 MB, over the
  600 MB target, so keep audio to familiar hymns.

## 9a. Phase 6 module interfaces (use these in Phase 7)

All ES modules. Load `config.js`, then supabase-js UMD (pinned + SRI, see `api.SUPABASE_JS`),
then the modules.
- `api.js`: `getHymns()`, `getFamiliarHymns()`, `getHymn(number)`, `hymnsForChapter(book, ch, verse)`,
  `getPlans()` (published plans, each with `days[{day_number, study{…, hymn, prayer}}]`),
  `getPrayers()`, `getTiming(hymn)`, `audioUrl(hymn)`, `storageUrl(bucket, key)`,
  `getPassage(book, ch, start, end)` → `{reference, verses[{num,text}], attribution}`. Everything
  is memoized for the session.
- `audio.js`: `new AudioPlayer({volume})`; **`await unlock()` in a tap first**; then
  `play(url, {loop, fade, from})`, `pause()`, `resume()`, `stop(fade)`, `seek(s)`, `setVolume(v)`,
  `duck(level)`, `unduck()`, getters `position`, `duration`, `paused`, `duckLevel`; events `play`,
  `pause`, `stop`, `ended`. MP3s are fetched once per session (blob URLs).
- `speech.js`: `RATES`, `localVoices()`, `splitLines(text)`,
  `new Speaker({ducker: audioPlayer, rate:'slow'})`; `unlock()` in the same tap;
  `speakVerses(verses)`, `speakText(text)` (each resolves when finished); `pause()`, `resume()`,
  `repeat()`, `stop()`, `setRate(name)`, `setVoice(v)`; events `segment {index,text}`,
  `state`, `end`.
- `lyrics.js`: `new LyricsView(el, {getTime: () => audio.position, onVerse({n,total,intro})})`,
  `setData(timing)`, `start()`, `stop()`. CSS: `.lyric-word.now/.sung`.
- `sheet.js`: `createSheet(el, {getTime, onStatus})` → `{show(timing), start(), stop()}`. abcjs 6.7.1
  is lazy-loaded (it must match the pipeline's version).

## 9. Phase 6 checklist (done; kept for reference)

- `web/js/api.js`: supabase-js UMD from a CDN at a **pinned version**, publishable key, reading
  published content. Scripture comes from the Edge Function.
- `web/js/audio.js`: Web Audio master gain, crossfade, loop, Storage URLs, iOS tap-to-unlock,
  `crossOrigin="anonymous"`, and **never re-download audio already fetched this session** (blob
  cache).
- `web/js/speech.js`:
  - `speakVerses()` with a pause between verses and verse-change events; `speakText()` for prayers
  - rates Slower 0.6 / Slow 0.8 (default) / Normal 1.0; pause/resume/stop/repeat
  - **duck the music to about 25%** while speaking, then restore it
  - local system voices only
  - On iOS, `pause()`/`resume()` are unreliable: pause by cancelling and remembering the verse,
    and speak one verse or line per utterance.
- `web/js/lyrics.js`, `web/js/sheet.js`: port v1's karaoke and abcjs cursor (pinned abcjs from a CDN).
- **Done when:** a test page **on the Pages preview URL** plays a hymn with highlighted words,
  then speaks Psalm 23:1-3 with ducking.
  - **Verified headless on `https://dev.hymnal-reader-v2.pages.dev/dev/core-test`:** words
    highlight in time, the sheet cursor follows, and the music ducks 100% → 25% → 100% while the
    Psalm is "read". Each MP3 downloads once per session. No errors.
  - **Still pending:** hearing the voice on a real device (iPad Safari or desktop Chrome). Headless
    has no voices.

## 10. Phase 7 (done): how the app behaves

- **Unlock:** sound needs a tap. Home tiles call `ctx.unlock()` inside the tap. Routes that need
  sound (`session`, `sing/<n>`, `read`), when opened by URL or reload, show "Tap to continue".
- **Session:**
  - The aide moves the steps with Next/Back; nothing auto-advances.
  - The hymn keeps playing softly (looped) under Scripture and prayer, and speech ducks it to 25%.
  - The step is saved in `hr.sessionStep`, so a reload resumes it.
  - Finish calls `store.completeDay()`, which sets `hr.progress {planId, currentDay, lastCompletedDate}`.
    After the last day, the plan starts over at Day 1.
- **localStorage keys:** `hr.progress`, `hr.sessionStep`, `hr.hymnNotes` (`enjoyed`/`skip` per hymn
  number), `hr.settings` (`rate`, `volume`, `voiceName`), `hr.lastSession`.
- **References:** a single psalm is labelled "Psalm 23" (web, function, admin). Existing study
  *titles* in the DB still say "Psalms …"; they're admin-only labels.
- **E2E check** (scratchpad Playwright, see §7): it walked Day 1, Finish, Enjoyed it, Home, Sing
  a Hymn, singing, reload-resume, Aide tools, Read the Bible and portrait. 20/20 passed on the
  Pages preview with no console errors.

## 11. Phase 8 (done on dev)

- **Accessibility:**
  - Every screen has one `h1` (`.sr-only` where the design shows none), and the router focuses it
    after navigation.
  - Scrolling cards are `tabindex=0`, `aria-label` regions.
  - Buttons, tiles and inputs use `--control-border` (#958873, 3.1:1). Keep the spec's #CFC3AE for
    decorative dividers only.
  - axe-core 4.13 (WCAG 2.0/2.1/2.2 A+AA + best practice) found 0 issues on 12 screen states. Keep it
    that way: re-run axe after UI changes (recipe in `docs/TESTING.md` and §7).
- **`docs/TESTING.md`:** automated results, the contrast table, and the manual device checklist.
- **`docs/DEPLOY.md`:** rewritten as the from-zero runbook (Part A), day-to-day (B), reference (C)
  and Free tier operations (D: pause/restore, keep-alive enable, Pro upgrade, cost math).
- **Verified on the preview:** an admin status change shows on the public site after a refresh
  (40 → 39 → 40 hymns).
- **Production:** merge `dev` → `main`, then run `docs/TESTING.md` §J.

## 12. Phase 9 (done)

- **`README.md`** (judge-facing): who it serves and the problem, the session flow, an architecture
  diagram (Mermaid), guardrails, sources and licenses, repo map, status, and **Known gaps**. Keep
  the gaps list honest and current: it's the backlog.
- **`docs/VALIDATION.md`:** a template only, for the user to fill in (roles only, no names).
- **`docs/licenses/`:** `open-prayer-book-LICENSE.txt` (CC0) and `FluidR3_GM-MIT.txt` (the
  soundfont used to render the MP3s; the GPL line in Debian's notice covers only its packaging).
- **Future work:** take items from README "Known gaps". Follow the coordination rules in §1. Re-run
  `tests/browser` (e2e + a11y) after any UI change.

## (Phase 8 brief, for reference)

See `docs/PLAN_PROMPT.md` Phase 8: accessibility pass (semantic, keyboard, WCAG AA contrast,
reduced motion), `docs/TESTING.md` manual checklist (iPad audio and speech unlock, ducking,
resume, simple mode), production deploy runbook, and the cost note.

(Phase 7 reference below.)

The session uses the published **"Sample — 12 Days"** plan.

See `docs/PLAN_PROMPT.md` Phase 7 and §4 (design tokens and session layout):
- Home (simple mode)
- Session (Hymn → Scripture → Prayer)
- Session finished
- Sing a Hymn (3×3 grid)
- Aide tools
- Read the Bible
- `localStorage` progress `{ planId, currentDay, lastCompletedDate }`

Use the published "Sample — 12 Days" plan for the session flow. "Sing a Hymn" draws on the 40
published hymns: show familiar ones (all 40 are familiar).
