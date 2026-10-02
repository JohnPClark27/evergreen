# Claude Code Prompt — Hymnal Reader v2 (rebuild from scratch)

> Paste this into Claude Code in an **empty folder** for the new project.
> The old repo (https://github.com/JohnPClark27/hymnal-reader) is cloned **read-only** at `../hymnal-reader-old` for reference only.
> Everything runs against **hosted** services from day one: a Supabase **Free tier** cloud project and Cloudflare Pages. **Never run the local Supabase stack** (no `supabase start` and no Docker).
> Work **one phase at a time**. At the end of each phase, commit, push, summarize, and **stop** until I say "go."

---

## 1. What we're building

**Hymnal Reader** is an accessible daily Bible study for elderly residents (especially residents with Alzheimer's) in senior living, used **with an aide** on an iPad. It's a Gloo AI Hackathon Track 2 (Scripture Beyond the App) project.

The project has three parts:

1. **Admin app (Python, desktop):** a PySide6 app where I manage and moderate everything:
   - hymns, audio, lyric timings
   - prayers
   - Bible studies (sessions) and multi-day plans
   - content status, validation, and an audit log
2. **Backend (Supabase Free tier, hosted):**
   - Postgres is the single source of truth.
   - Storage holds the MP3s, ABC files, and timing JSON.
   - One Edge Function proxies the YouVersion API.
3. **Public app (static web, iPad-first):**
   - **Today's Session:** Hymn → Scripture → Prayer, with Scripture and prayer read aloud at the resident's pace.
   - **Simple mode:** big buttons for residents.
   - **Full reader and hymnal:** the reader plays matched hymns, and the hymnal shows sing-along words and sheet music.
   - **Aide tools.**

---

## 2. Non-negotiable rules (every phase)

### Git
- Initialize a new repo. All work happens on branch `dev`. Commit at the end of every phase (`phase N: …`), and push if a remote exists.
- Never force-push and never commit to `main`. I'll merge.
- **Never commit secrets.** That means `.env` files and Supabase keys. Add `.gitignore` entries in Phase 0.
- Don't commit MP3s, the `vendor/` folder, or large binaries.

### Code
- Keep it simple and readable. I'm a student, so add short comments where the logic isn't obvious.
- Use only the dependencies listed here. Anything new needs a one-line justification, and you must ask first.
- **Reuse proven logic from the old repo** (ABC parsing, MP3 rendering, lyric timing and verification) by porting it cleanly. Don't copy its structure or its mess.

### Content integrity
- **Never write original prayers, Scripture, or theological text.**
- Prayers come from the Open Prayer Book project (public domain BCP 1662/1979), or are added by me in the admin app with a **required source field**.
- Scripture text always comes from YouVersion at runtime. Never store or hardcode full verse text in the repo.
- Always show the YouVersion attribution with Scripture, and the source with each prayer.

### Privacy and resident safety
- **No resident accounts and no personal data.** The public app needs no login.
- Per-device progress and notes go in `localStorage` only.
- **No engagement mechanics:** no streaks, badges, scores, or "you missed a day" messages.
- **No medical claims** in any copy.

### Audio and voice
- Read-aloud uses the browser's **built-in Web Speech API** system voices only.
- No cloud or neural TTS, and no AI-generated music, audio, or art.

### Security
- The **Supabase service role key is used only by the admin app,** loaded from a local `.env`.
- It never appears in the public app, Edge Functions, or git.
- The public app uses the **anon key**, and RLS lets it read **published** content only.

### Questions
- If something is ambiguous, **ask me** before guessing.

---

## 2b. Hosting from day one (Supabase Free tier)

**Hosted only**
- Use the Supabase CLI **only** to talk to the hosted project: `supabase link`, `supabase db push`, `supabase functions deploy`, and `supabase secrets set`.
- Never run `supabase start`, `supabase db reset` against a local stack, or anything that needs Docker.
- If the CLI can't do something, give me SQL to paste into the dashboard's SQL Editor instead.

**Free tier limits are design constraints**

| Limit | Value |
|---|---|
| Database | 500 MB |
| File storage | 1 GB |
| Egress | 5 GB/month |
| Max upload | 50 MB per file |
| Pausing | Projects pause after 7 days of inactivity |

**Storage budget**
- Audio uploads default to **familiar hymns only.**
- Target **≤ 600 MB total in Storage** to leave headroom.
- The importer must report the bucket total and **refuse to upload past 900 MB.**

**Smaller audio**
- Render MP3s as **mono, 96 kbps.** That's plenty for piano hymns and roughly a third of the size.
- Make the bitrate a pipeline setting.

**Egress**
- Set long `cache-control` headers on Storage files.
- The public app must never re-download audio it already has in the session.

**Pausing**
- Document in `docs/DEPLOY.md` how to restore a paused project.
- Add an **optional** GitHub Actions workflow, `.github/workflows/keepalive.yml`, **disabled by default.** It runs one tiny read query every 3 days using the anon key from GitHub secrets.
- Tell me it exists. I'll decide whether to enable it.

**Preview deploys**
- From Phase 0 onward, Cloudflare Pages deploys `web/` from the `dev` branch.
- **Every public-app phase is checked on the deployed preview URL,** not just locally.

**Upgrade path**
- Nothing in the code may depend on Pro-only features.
- Moving to Pro later must need zero code changes.

---

## 3. Repo layout (target)

```
hymnal-reader-v2/
  admin/            # PySide6 desktop admin app (Python 3.11+)
  pipeline/         # ABC import, MP3 render, lyric timing (ported from old repo)
  supabase/
    migrations/     # SQL schema + RLS
    functions/      # Edge Function: youversion proxy
    seed/           # seed scripts / JSON
  web/              # public static app (HTML/CSS/vanilla JS modules, no build step)
  docs/             # PLAN, DEPLOY, TESTING, VALIDATION, licenses
  .env.example
```

---

## 4. Design tokens for the public app (from approved mockups)

| Token | Value |
|---|---|
| Background | `#F7F3EA` (sepia paper) |
| Surface | `#FFFDF8` |
| Border | `#E4DACA` / `#CFC3AE` |
| Ink | `#221E19` |
| Muted ink | `#5A5248` |
| Accent | `#7A2533` (burgundy) |
| Accent soft | `#F1E3E2` |
| Highlight (current word or verse) | `#F6E1A6` |

**Fonts:** Literata (reading, headings) and Atkinson Hyperlegible (UI), both from Google Fonts.

**Sizing:**
- Touch targets at least 64 px. Base text at least 28 px in session views.
- iPad landscape (1180×820) is the primary layout, and it must also work in portrait.

**Session screen layout:**
- **Top bar:** Home button, a step tracker (1 · Hymn → 2 · Scripture → 3 · Prayer, with checkmarks on completed steps), and "Day N of 30."
- **Content card:** the hymn lyrics, Scripture, or prayer, with the current word or verse highlighted.
- **Bottom bar:** Back, Read/Sing again, a large round Pause button, and Next.

---

## Phase 0: Scaffold and plan

1. Create the repo layout above, `.gitignore`, `.env.example`, and a README stub.
2. **Hosted setup.** Write `docs/DEPLOY.md` with these steps for me to do by hand, then **stop and wait until I confirm they're done:**
   - Create a Supabase **Free** project, and note the project ref, URL, anon key, and service role key.
   - Install the Supabase CLI, `supabase login`, then `supabase link --project-ref <ref>`.
   - Create the GitHub repo and push `dev`.
   - Connect Cloudflare Pages to the repo: build output `web/`, no build command, preview deploys on `dev`.
3. Add a placeholder `web/index.html` so the first Pages deploy works.
4. Add `web/config.example.js` for the Supabase URL and anon key.
   - These two values are safe to publish.
   - `web/config.js` is committed with real values once I provide them.
   - The service role key never goes here.
5. Read the old repo and write `docs/PLAN.md` covering:
   - Which old modules get ported (ABC parsing, MP3 render script, timing builder and verifier, abcjs cursor/karaoke logic), and what's dropped.
   - The final DB schema (draft it here, then confirm with me).
   - The risks: the YouVersion terms on caching, iOS audio and speech unlock, and Storage CORS.

✅ **Done when:** I approve `PLAN.md`, the CLI is linked to the hosted project, and the placeholder page loads from the Cloudflare Pages preview URL. **Stop.**

---

## Phase 1: Supabase schema and RLS

Write SQL migrations in `supabase/migrations/`.

**Tables:**
- **`hymns`:** `id`, number, title, tune, first_line, meter, abc_path, audio_path, timing_path, timing_verified (bool), stanza_count, is_familiar (bool), status, notes, created_at, updated_at
- **`hymn_scripture_refs`:** hymn_id, book, chapter, verse_start, verse_end
- **`topics`** and **`hymn_topics`**
- **`prayers`:** `id`, slug, title, text, source (required), section, attribution, status, timestamps
- **`studies`:** one session, with `id`, title, hymn_id, passage (book/chapter/verse_start/verse_end), prayer_id, aide_note (optional, short, written by me), status, timestamps
- **`plans`:** `id`, title, description, status
- **`plan_days`:** plan_id, day_number, study_id, unique (plan_id, day_number)
- **`audit_log`:** `id`, at, actor, action, table_name, row_id, before (jsonb), after (jsonb)

**Rules:**
- `status` is one of `draft`, `approved`, `published`, `archived`.
- **RLS:**
  - The anon role can `select` only rows where `status = 'published'`. For join tables, only rows whose parent is published.
  - The anon role can't write anything.
- Add an `updated_at` trigger.
- Add indexes on the foreign keys and on `hymn_scripture_refs (book, chapter)`.

✅ **Done when:** `supabase db push` applies the migrations to the **hosted** project, and a short test using the anon key over the REST API shows drafts can't be read. **Stop.**

---

## Phase 2: Data pipeline and import

1. **Port to `pipeline/` from the old repo:**
   - ABC → metadata parser (titles, tunes, scripture refs, topics)
   - MP3 render (abc2midi → FluidSynth → SoX → LAME)
   - Lyric timing builder and verifier
2. **Write `pipeline/import_hymns.py`:**
   - Parse the Open Hymnal ABC files.
   - Upsert into `hymns`, `hymn_scripture_refs`, and `topics`.
   - Upload the ABC, MP3, and timing JSON to Storage buckets (`hymn-abc`, `hymn-audio`, `hymn-timings`).
   - Set the Storage cache headers to a long max-age.
   - **Idempotent:** skips unchanged files using a hash. Supports `--dry-run`.
   - **Audio defaults to familiar hymns only.**
     - Use `--audio all` to override. It still obeys the 900 MB cap.
     - ABC and timing files (small) upload for all hymns.
   - Prints the bucket totals before and after each run.
   - Re-render MP3s as mono 96 kbps (configurable) before upload.
   - Seed `is_familiar` from a starter list of about 40 widely known titles that match the DB. I'll adjust it in the admin app.
3. **Write `pipeline/import_prayers.py`:**
   - Clone https://github.com/freebcp/open-prayer-book into `vendor/` (gitignored).
   - Extract **exactly these 15 prayers verbatim** by their opening words.
   - If one isn't found, **stop and report** instead of writing it from memory.
   - Copy the repo's LICENSE to `docs/licenses/`.

| slug | Title | Book | Opening words |
|---|---|---|---|
| lords-prayer | The Lord's Prayer | 1662 | "Our Father, which art in heaven" |
| gloria-patri | Glory Be | 1662 | "Glory be to the Father" |
| the-grace | The Grace | 1662 | "The grace of our Lord Jesus Christ" |
| collect-for-peace-morning | Collect for Peace | 1662 | "O God, who art the author of peace" |
| collect-for-grace | Collect for Grace | 1662 | "O Lord, our heavenly Father, Almighty and everlasting God, who hast safely brought us" |
| collect-for-peace-evening | Evening Collect for Peace | 1662 | "O God, from whom all holy desires" |
| lighten-our-darkness | Collect for Aid against All Perils | 1662 | "Lighten our darkness, we beseech thee, O Lord" |
| general-thanksgiving | The General Thanksgiving | 1662 | "Almighty God, Father of all mercies" |
| st-chrysostom | A Prayer of St. Chrysostom | 1662 | "Almighty God, who hast given us grace at this time" |
| collect-for-purity | Collect for Purity | 1662 | "Almighty God, unto whom all hearts be open" |
| keep-watch | Keep Watch, Dear Lord | 1979 | "Keep watch, dear Lord, with those who work, or watch, or weep" |
| be-present | Be Present, O Merciful God | 1979 | "Be present, O merciful God, and protect us" |
| support-us-all-the-day | Support Us All the Day Long | 1979 | "O Lord, support us all the day long" |
| st-francis | A Prayer Attributed to St. Francis | 1979 | "Lord, make us instruments of your peace" |
| quiet-confidence | For Quiet Confidence | 1979 | "O God of peace, who hast taught us that in returning and rest" |

4. **Imported status:**
   - Prayers are imported as `published`.
   - Hymns are imported as `approved`. I'll publish them from the admin app.
5. **`setup.sh`:** a one-command setup for Ubuntu/WSL that installs the pipeline tools and Python deps.

✅ **Done when:**
- All hymns and the 15 prayers are in the **hosted** DB.
- Familiar-hymn audio is in Storage, with total Storage under 600 MB.
- An import report lists any hymns with failed timing verification.

**Stop.**

---

## Phase 3: Admin app core (PySide6)

**Stack:** PySide6, supabase-py, python-dotenv, QtMultimedia (audio preview). Nothing else without asking.

**App structure:**
- Main window with a left nav: **Dashboard · Hymns · Prayers · Studies · Plans · Pipeline · Audit Log · Settings.**
- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `admin/.env`.
- Shows a clear error screen if they're missing.

**Dashboard:**
- Counts by status.
- A **Free tier usage card:** Storage used vs. 1 GB (summed from the bucket listings), and a reminder about the 7-day pause.
- A **validation panel** that lists problems, each clickable to jump to the item:
  - hymns missing audio
  - unverified timings
  - studies pointing to unpublished hymns or prayers
  - plans with gaps in their day numbers

**Hymns manager:**
- Searchable, sortable table (number, title, familiar, status, timing verified).
- Detail panel:
  - edit metadata
  - toggle "familiar"
  - edit scripture refs and topics
  - play/stop the MP3 preview
  - view the ABC text (read-only)
  - change status

**Prayers manager:**
- List and detail views.
- Add/edit, with **source required.** Saving is blocked without it.
- Change status.

**General behavior:**
- **Every write goes through one data-access module** that also writes to `audit_log`, with before/after JSON.
- Long operations run in a `QThread` worker with a progress bar. The UI never freezes.
- Clean, readable styling (one QSS file). Dark/light follows the system.

✅ **Done when:** I can find a hymn, mark it familiar, publish it, add a prayer with a source, and see both actions in the Audit Log. **Stop.**

---

## Phase 4: Study and plan builder

**Studies editor:**
- Pick a hymn from a searchable list, filterable to familiar hymns.
- Pick a passage with a book/chapter/verse picker.
  - When the hymn has scripture refs, **suggest passages from them.**
- Pick a prayer.
- Optional short aide note.
- **Preview pane:**
  - fetches the passage text through the Edge Function (or directly from YouVersion, using a key from the admin `.env`)
  - shows the full session as the resident will see it
  - plays the hymn audio
- Change status.

**Plans editor:**
- A day list with **drag-and-drop reordering.**
- Add an existing study, create a new study inline, or duplicate a day.
- Shows warnings for:
  - repeated hymns on back-to-back days
  - repeated prayers on back-to-back days
  - unpublished studies
- **Publish plan** publishes the plan and validates that every day's study, hymn, and prayer is published. If any aren't, it lists them and blocks publishing.

**Seed plan:**
- Build a starter **"Memory Care — 30 Days"** plan from familiar hymns, short comforting passages (1–6 verses), and the 15 prayers.
- Save it as `draft` for me to review in the app.

✅ **Done when:** I can build, reorder, preview, and publish a 3-day plan entirely in the admin app. **Stop.**

---

## Phase 5: YouVersion Edge Function

1. Create `supabase/functions/youversion/`:
   - Accepts book, chapter, and an optional verse range.
   - Returns the verses plus the attribution text.
   - The API key comes from Supabase secrets.
2. **Caching:** first check the YouVersion Platform terms.
   - If caching is allowed, cache with a configurable TTL.
   - If it's unclear, don't cache, and tell me.
3. Add CORS for the Cloudflare Pages domain(s) and localhost only. Add basic rate limiting.
4. Deploy with `supabase functions deploy youversion`. Set the key with `supabase secrets set YOUVERSION_API_KEY=…`. I'll paste the value myself.

✅ **Done when:** `curl` against the **hosted** function URL returns Psalm 23:1-3 with attribution, and a bad reference returns a clear 400. **Stop.**

---

## Phase 6: Public app — data, audio, and speech core

1. **`web/js/api.js`:**
   - Uses supabase-js (UMD from a CDN, pinned version) with the **anon key** to read published content.
   - Calls the Edge Function for Scripture.
2. **`web/js/audio.js`:**
   - A Web Audio player with a master gain, crossfade, and loop.
   - Plays from the Storage public URLs.
   - Handles the iOS tap-to-unlock.
3. **`web/js/speech.js`:**
   - `speakVerses()` with a pause between verses and verse-change events.
   - `speakText()` for prayers.
   - Rate settings Slower 0.6 / Slow 0.8 (default) / Normal 1.0.
   - Pause, resume, stop, repeat.
   - **Ducks the music gain** to about 25% while speaking, then restores it.
   - Uses local system voices only.
4. **`web/js/lyrics.js` and `web/js/sheet.js`:** port the karaoke highlighting and the abcjs sheet-music cursor from the old repo, reading timing JSON from Storage.

✅ **Done when:** a test page **on the Pages preview URL** plays a hymn with highlighted words, then speaks Psalm 23:1-3 with ducking. **Stop.**

---

## Phase 7: Public app — screens

Build these to match the design tokens and session layout in section 4.

1. **Home (simple mode):**
   - "Welcome." with three large tiles: **Today's Hymn & Verse** (primary), **Sing a Hymn**, **Read the Bible**.
   - A small "Aide tools" link.
2. **Session:** Hymn → Scripture → Prayer, using the published plan.
   - **Hymn:** title, "Based on [ref]," large karaoke lyrics, verse X of Y, "Show sheet music."
   - **Scripture:** reference, a "Reading aloud · Slow" badge, verses with the current verse highlighted, attribution.
   - **Prayer:** large centered text with the current line highlighted, and the source line.
   - **No scroll-triggered music changes** in the session.
3. **Session finished:**
   - "That's today's session." with thanks.
   - "Day N+1 will be ready next time."
   - Optional aide taps: **Enjoyed it** / **Skip next time** (localStorage only).
   - Buttons for Sing again / Sing another hymn / Home.
4. **Sing a Hymn:**
   - A 3×3 grid of familiar hymns showing title, first line, and an "Enjoyed before" tag.
   - Enjoyed hymns come first, and skipped hymns are hidden.
5. **Aide tools:**
   - A 30-day picker and a Start Day button.
   - Reading speed, music volume, and voice (local voices only).
   - "Reset hymn notes…" with a confirmation.
   - "Notes stay on this tablet. No names are saved."
6. **Read the Bible:**
   - Large-print reader with a book/chapter picker and read-aloud.
   - Optional matched-hymn background music, as in the old app, with scroll-based crossfade **off by default.**
7. **Progress:** `{ planId, currentDay, lastCompletedDate }` in localStorage. Resume works on reload.

✅ **Done when:** **on the Pages preview URL** at an iPad-sized viewport, a first-time user can run Day 1 end to end, return Home, and sing a hymn using only big buttons. **Stop.**

---

## Phase 8: Accessibility, testing, deploy

1. **Accessibility:**
   - Semantic buttons, labels, and visible focus.
   - Keyboard operable.
   - WCAG AA contrast.
   - `prefers-reduced-motion` respected.
2. **`docs/TESTING.md`:** a manual checklist covering iPad Safari audio and speech unlock, ducking, resume, and simple mode. Run what you can at iPad viewport sizes.
3. **Production deploy:**
   - Finalize `docs/DEPLOY.md` as a full from-zero runbook: project, link, db push, secrets, importers, function deploy, Pages, config.
   - Add a section on **restoring a paused Free project** and on upgrading to Pro (no code changes).
   - Explain how to enable the optional keep-alive workflow.
   - Cost note:
     - Everything runs at **$0** on Supabase Free plus Cloudflare Pages.
     - The limits to watch are 1 GB storage, 5 GB/month egress, and the 7-day pause.
     - Show the rough math: average MP3 size × plays per month vs. 5 GB.

✅ **Done when:** the production Pages URL serves the app, and the admin app can publish a change that appears there after a refresh. **Stop.**

---

## Phase 9: Docs for judges

1. **`README.md`:**
   - who it serves and the problem
   - the session flow
   - the architecture diagram (admin app → Supabase → public app)
   - the guardrails
   - the sources and licenses (Open Hymnal Project, Open Prayer Book project, ASV via YouVersion)
2. **`docs/VALIDATION.md`:** a template only (I fill in results), with these sections:
   - Assumptions before
   - Who we met (roles only)
   - What we learned
   - What was wrong
   - What we changed
3. **Known gaps:** a list of everything that's unfinished.

✅ **Done when:** the docs are complete. Commit, push, and **stop.** Don't merge to `main`.

---

## If time is short (hackathon MVP order)

**Must have:** 0 → 1 → 2 → Phase 3 hymns/prayers only → Phase 4 seed plan → 5 → 6 → 7 (Home, Session, Finished) → 8 deploy. Everything is hosted from Phase 0, so there's always a live link to show.

**Cut first:** the Read the Bible screen, the full Pipeline UI, drag-and-drop (use up/down buttons instead), and sheet-music cursor polish.
