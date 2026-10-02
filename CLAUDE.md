# Hymnal Reader v2: agent handoff

Read this first. It's the shared state for every agent working in this repo: what's done,
what's live, the rules, and how to avoid stepping on each other. The full spec is
`docs/PLAN_PROMPT.md` (phases 0–9). The approved design is `docs/PLAN.md`, and the runbook is
`docs/DEPLOY.md`.

**Status (2026-10-02): Phases 0–6 are done and pushed to `dev`. Next is Phase 7** (public app
screens). Phase 6's real-device speech check is still pending (see §9).

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
   `supabase/migrations/20261001000005_<name>.sql`. Pick the next free number after `git pull`;
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
- **Secrets:** never print, cat, echo, or commit `admin/.env` (it holds the service role key).
  Check key *names* only (`grep -q '^KEY=.' admin/.env`). `supabase secrets list`: print names only.
- **Service role key:** only in the admin app and pipeline (from `admin/.env`). Never in `web/`,
  never in Edge Functions, never in git. The public app uses the publishable key in
  `web/config.js` (safe to publish, already committed).
- **Content integrity:** never write prayers, Scripture, or theological text. Prayers come only
  from Open Prayer Book (importer) or the admin app with a required `source`. Scripture comes
  from YouVersion at runtime: **never store verse text** (no DB columns, seeds, fixtures, or
  hardcoded text). Always show the YouVersion attribution with Scripture and the source with
  each prayer.
- **Privacy:** no accounts, no personal data, progress only in `localStorage`. **No engagement
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
| Cloudflare Pages | output `web/`, no build. Preview: `https://dev.hymnal-reader-v2.pages.dev/` (production `hymnal-reader-v2.pages.dev`). `/` is still a placeholder. Phase 6 test page: `/dev/core-test`. Pages serves clean URLs: `x.html` 308-redirects to `x`. |
| DB content | 301 hymns: **40 `published`** (well-known, fully public domain per a strict ABC-file rule: `supabase/seed/publish_pd_hymns.py`), the rest `approved`. 50 `is_familiar` (the original 46 plus #67, #83, #169, #170, set in the DB; `familiar.txt` only seeds first imports). 1313 scripture refs, 158 topics, 15 prayers (`published`). Plans: **"Sample — 12 Days" (`published`**, 12 published studies) and "Memory Care — 30 Days" (`draft`; 4 of its studies are shared with the sample plan and are published). |
| Storage | public buckets `hymn-abc`, `hymn-audio`, `hymn-timings`, about 107 MB total. Audio only for the 50 familiar hymns, so every published hymn has audio. |
| Edge Function | `youversion` deployed (`--no-verify-jwt`). Secret `YOUVERSION_API_KEY` is set (by the user). |
| Migrations applied | `…0001_schema`, `…0002_rls`, `…0003_storage_buckets`, `…0004_rate_limits` |

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
| Admin app | `admin/app.py` (entry), `data.py` (**the only module that talks to Supabase; every write is audited**), `worker.py` (QThread + global `NETWORK_LOCK`), `theme.py` + `style.qss`, `books.py`, `pages/*.py` | Run: `source .venv/bin/activate && python admin/app.py` |
| Pipeline | `pipeline/abc_meta.py`, `render_mp3.sh`, `timings/build_timings.mjs`, `import_hymns.py`, `import_prayers.py`, `supa.py`, `familiar.txt` | Output cache: `pipeline/out/` (gitignored) |
| Supabase | `supabase/migrations/`, `functions/youversion/{index,lib,test}.ts`, `seed/`, `tests/rls_anon_test.sh`, `config.toml` | `node supabase/functions/youversion/test.ts` |
| Public app | `web/index.html` (placeholder), `web/config.js`, `web/css/core.css` (design tokens + component styles), `web/js/{api,audio,speech,lyrics,sheet}.js` (Phase 6 core; see §9a), `web/dev/core-test.html` | Phase 7 builds the screens on these modules |
| Docs | `docs/PLAN_PROMPT.md` (spec), `PLAN.md`, `DEPLOY.md`, `licenses/` | |

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

## 10. Next: Phase 7 (screens)

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
