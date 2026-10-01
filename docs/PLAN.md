# Hymnal Reader v2: Plan

Status: **approved 2026-10-01**. All recommendations accepted (marked ✅ below).

The old repo (`../hymnal-reader-old`) was an Express + SQLite reading app. The music
followed your scroll position, and you could open a sing-along strip or sheet music.
v2 keeps its proven music and timing logic and drops everything else. The new frame is
an admin app, then Supabase, then a static iPad app.

---

## 1. What gets ported from the old repo

| Old file | What it does | v2 destination | Notes |
|---|---|---|---|
| `scripts/build_hymn_db.py` | ABC to metadata: title, tune, `%OHSCRIP` refs to USFM, `%OHTOPICS` with stanza lists, `w:` lyrics | `pipeline/abc_meta.py` | Port the parsers as-is: `USFM` map, `parse_span`, `parse_scripture`, `parse_topics`, `clean_lyrics`. Drop the SQLite code. Add `meter` (`%OHMETRICAL`), `first_line` (stanza 1 from `w:`), and `stanza_count`. |
| `audio-setup/render_mp3s.sh` | `mk-abc-for-midi` → `abc2midi` → FluidSynth (FluidR3) → SoX trims trailing silence → LAME | `pipeline/render_mp3.sh` | **Only the LAME step changes:** `-V2` stereo becomes `-m m -b ${MP3_BITRATE_KBPS:-96}` (mono CBR). The MIDI stays identical, so the timings stay valid. Keep the `temp.abc` → `Build-Midi/` → raw fallback order. |
| `audio-setup/setup.sh` | apt packages, clone Open Hymnal, fix `bin/ohroot` | `setup.sh` (repo root) | Same steps, plus Python venv and deps. No `audio/` symlink, no SQLite. |
| `scripts/build_lyric_timings.mjs` | Rebuilds the MIDI, pairs melody onsets with `w:` syllables, verifies stanza passes, checks MIDI vs MP3 length, builds 5-stanza pages, handles approximate text-only stanzas | `pipeline/timings/build_timings.mjs` | See ✅1. Input changes from SQLite rows to a JSON list (`--abc <path> --mp3 <path> --out <file>`), so the Python importer can call it per hymn. All alignment logic is kept unchanged. |
| `public/js/crossfader.js` | Two `<audio>` decks to GainNodes to master gain, crossfade, pause/resume that really stops the clock | `web/js/audio.js` | Keep the graph and the pause rules. Add `crossOrigin = 'anonymous'` (Storage is cross-origin, see Risks), a session URL cache (blob URLs) so audio isn't re-downloaded, a `duck(level)` ramp on a separate gain, and the iOS unlock. |
| `public/js/lyrics.js` | Binary search for the stanza or word at time *t*, `SING_LEAD`, karaoke highlight | `web/js/lyrics.js` | Keep the timing math. Rewrite the view from a one-line scrolling strip to **large stanza lines** (28px+) for the session card. Load the JSON from Storage. |
| `public/js/score.js` | abcjs rendering, melody-note to syllable mapping, cursor, multi-page hymns | `web/js/sheet.js` | Keep `melodyNotes`, `currentSyllable`, `unionBox`, the ABC cleanup, and paging. Load abcjs from a pinned CDN on first use instead of `/vendor`. |
| `server/youversion.js` | YouVersion client (`X-YVP-App-Key`), `parseVerses()` from the passage HTML | `supabase/functions/youversion/` | Port `parseVerses` (the `yv-v` span splitting). The in-memory cache waits on the terms check (Risk 1). |
| `server/hymns.js` | Hymns for a ref (verse matches before chapter matches), "sticky" chapter sections | `web/js/match.js` (Phase 7, Read the Bible) and the admin study editor ("suggest passages") | Becomes a client-side query on the published `hymn_scripture_refs` instead of SQLite. |
| `public/js/books.js` | Book list / USFM names | `web/js/books.js` | For the Read the Bible picker and for "Based on Ps 23" labels. |

**Dropped:** Express server and `server.js`, `better-sqlite3`, `scripts/check.js` (replaced by
the Phase 1 anon-key REST test), browser-sync/concurrently, the AI-match stubs (`server/ai.js`,
`ai-badge.js`), scroll-driven hymn switching as a *default* (it survives only as an
off-by-default option in Read the Bible), the settings popover, the full searchable hymnal
index (`hymnal.js`, simplified to the 3×3 "Sing a Hymn" grid), and v1's styling (the new design
tokens replace it).

### ✅1. The timing builder: keep it in Node, or rewrite in Python?

The timing builder parses the ABC with **abcjs**, and the browser draws the sheet-music
cursor with **abcjs** too. `noteTimes[stanza][j]` only lines up with note *j* on screen
because both sides use the same parser. A Python rewrite would need a new ABC parser that
reproduces abcjs's note list exactly (ties, grace notes, lyric rows). That's a large source of
subtle bugs.

**Recommendation:** keep it as a small Node script with the same two dev-only deps as v1
(`abcjs` and `@tonejs/midi`, pinned in `pipeline/timings/package.json`).
`pipeline/import_hymns.py` calls it with `subprocess`. Node is already installed (v24).
These deps never ship to the web app or the admin app. Approve?

---

## 2. Database schema (draft, please confirm)

All tables live in `public`. `status` is the enum `content_status` with the values `draft`,
`approved`, `published`, and `archived`, plus `created_at`/`updated_at` and an `updated_at`
trigger where shown.

### hymns
| column | type | notes |
|---|---|---|
| id | `bigint` identity PK | |
| number | `int` unique not null | Hymn number shown in the app. ✅2 |
| source_file | `text` unique not null | e.g. `Amazing_Grace/Amazing_Grace-New_Britain.abc`. **Added:** the importer's upsert key. |
| title | `text` not null | from `T:` |
| tune | `text` | from the file name |
| first_line | `text` | stanza 1, first poetic line |
| meter | `text` | `%OHMETRICAL`, e.g. `8 6 8 6` / `CM` |
| stanza_count | `int` | |
| abc_path / audio_path / timing_path | `text` | object keys in the `hymn-abc` / `hymn-audio` / `hymn-timings` buckets |
| file_hashes | `jsonb` | **Added:** `{abc, audio, timing}` sha256 values so re-imports skip unchanged files |
| timing_verified | `bool` default false | `synced` from the timing builder |
| is_familiar | `bool` default false | |
| status | `content_status` default `draft` | importer sets `approved` |
| notes | `text` | |
| created_at, updated_at | `timestamptz` | |

### hymn_scripture_refs
`id` PK, `hymn_id` FK → hymns (cascade), `book text` (USFM: `PSA`, `JHN`, …), `chapter int`,
`verse_start int` (null = whole chapter), `verse_end int`.
Index on `(book, chapter)` and `(hymn_id)`.

### topics / hymn_topics
- `topics`: `id` PK, `name text unique`
- `hymn_topics`: `hymn_id` FK, `topic_id` FK, `stanzas text` (e.g. `"3,4"`, null = whole hymn). PK (hymn_id, topic_id).

### prayers
`id` PK, `slug text unique`, `title`, `text`, **`source text not null check (length(trim(source)) > 0)`**,
`section text` (e.g. "Morning Prayer"), `attribution text` (e.g. "Book of Common Prayer, 1662"),
`status`, timestamps.

### studies (one session)
`id` PK, `title`, `hymn_id` FK, `book`, `chapter`, `verse_start`, `verse_end` (passage,
verses required for studies), `prayer_id` FK, `aide_note text check (length(aide_note) <= 280)`,
`status`, timestamps. Indexes on `hymn_id` and `prayer_id`.

### plans / plan_days
- `plans`: `id`, `title`, `description`, `status`, timestamps
- `plan_days`: `id`, `plan_id` FK (cascade), `day_number int check (> 0)`, `study_id` FK,
  `unique (plan_id, day_number)`. Indexes on the FKs.

### audit_log
`id` PK, `at timestamptz default now()`, `actor text` (the OS username of whoever ran the
admin app), `action text` (`insert`/`update`/`delete`/`status`), `table_name`, `row_id text`,
`before jsonb`, `after jsonb`. **No anon access at all.**

**As built (Phase 1):** `studies.hymn_id` and `prayer_id` are nullable so a draft can be
half-built, but a check constraint requires both once `status = 'published'`.
`hymn_scripture_refs.book` and `studies.book` must look like a USFM code.

### RLS
- RLS on for every table. **No insert/update/delete policies for `anon`**, so writes are denied.
  Write grants are also revoked from `anon`/`authenticated` as a second lock, and `authenticated` gets the same read-only rules as `anon`.
  The admin app uses the service role, which bypasses RLS.
- `anon` select policies:
  - `hymns`, `prayers`, `studies`, `plans`: `status = 'published'`
  - `hymn_scripture_refs`, `hymn_topics`: the parent hymn is published
  - `topics`: readable when linked to a published hymn
  - `plan_days`: the parent plan is published **and** its study is published
- `audit_log`: no anon policy.

### Storage
Three **public** buckets (`hymn-abc`, `hymn-audio`, `hymn-timings`). Uploads set
`cacheControl: 31536000` (1 year). Object keys include a short content hash
(`<number>-<hash8>.mp3`), so a changed file gets a new URL and the long cache stays safe.
**Note:** public bucket URLs can be fetched by anyone who guesses them, even for
non-published hymns. The content is public domain, so I think that's fine. The *metadata*
stays behind RLS.

### ✅ Schema questions
- **✅2 Hymn numbers.** Open Hymnal has no numbers. I propose numbering 1…301 by sorted file
  path, the same order as v1's ids, so known issues like "#106 malformed" keep their numbers.
  OK?
- **✅3 One row per tune.** 301 ABC files cover 289 hymn folders, because a few texts have two
  tunes. One `hymns` row per **file** (title + tune) is what v1 did. OK?
- **✅4 Additions.** OK to add `source_file` and `file_hashes` to `hymns`?
- **✅5 Bible translation.** ASV (YouVersion bible id 12), as in v1 and Phase 9's sources list?

---

## 3. Risks

### R1. YouVersion terms (caching, attribution, use)
- v1 cached passages in memory without checking the terms. In Phase 5 I'll read the current
  YouVersion Platform terms **before** adding any cache. If they're unclear: no cache, and I'll tell you.
- The API key lives only in Supabase secrets (Edge Function). It's never in `web/` or the admin `.env` unless you add one for the Phase 4 preview.
- v1 noted **non-commercial use only**. A free tool for residents fits that, but it should be
  stated in the README.
- Attribution: the API returns copyright/translation info. We show it under every passage.
- No verse text is stored: no DB columns, no seed files, no test fixtures.

### R2. iOS audio and speech unlock
- **AudioContext** starts suspended on iOS. It must be created or `resume()`d inside a tap
  handler. Every session starts from a big "Start" tap, which also unlocks speech.
- **Silent switch:** Web Audio goes through the iOS "ringer" channel on older iOS, so the
  hardware mute switch can silence music while speech still plays. TESTING.md gets a
  "check the mute switch" step for aides.
- **speechSynthesis:**
  - The first `speak()` must happen in a gesture.
  - Voices load asynchronously (`voiceschanged`).
  - `pause()`/`resume()` are unreliable on iOS Safari. Pause will instead `cancel()` and
    remember the current verse; Resume re-speaks from that verse start.
  - Long utterances can stop silently, so we speak **one verse or prayer line per utterance**.
    This also gives us the verse-change events.
- **Background tab / screen lock** suspends audio. Resume needs a tap: show a large "Continue" button.
- **Ducking:** iOS may also duck our audio itself while speaking. Our own 25% duck is a gain
  ramp, so the two together are fine but need a real-iPad check.

### R3. Storage CORS and egress
- `audio.js` routes `<audio>` through `MediaElementSource`. A **cross-origin** source without
  CORS plays **silence** in that graph. Fix: `audio.crossOrigin = 'anonymous'`. Supabase
  Storage public URLs send `Access-Control-Allow-Origin: *`, and I'll verify that on the hosted
  bucket in Phase 2, including `Range` requests from Safari.
- Timing JSON and ABC files are plain `fetch()`es, fine with `*`.
- **Egress (5 GB/month):** mono 96 kbps ≈ 0.7 MB/min, ≈ 1.5 MB per hymn. We cache within the
  session (blob URL map) and set a 1-year `cache-control` on Storage objects.
- **Storage budget (measured in Phase 2):**

  | | Size |
  |---|---|
  | v1's 292 MP3s at `-V2` stereo | 908 MB |
  | Mono 96 kbps is only about 30% smaller (v1's VBR already averaged about 136 kbps) | e.g. Amazing Grace 3.6 MB → 2.5 MB |
  | **Actual after the import:** 46 familiar MP3s + 301 ABC + 301 timing files | **101 MB** |
  | All 301 MP3s (`--audio all`), estimated | ≈ 640 MB, over the 600 MB target |

  Familiar-only stays far under target. `--audio all` would pass 600 MB, so keep it for
  hymns you actually use. The importer still refuses anything past the 900 MB cap.

### R4. Other
- **Free-tier pause** (7 days): documented in DEPLOY.md; optional keep-alive workflow ships disabled.
- **Single-stanza audio:** Open Hymnal's expander can't build all stanzas for #100 Holy, Holy,
  Holy and #186 O Come, All Ye Faithful (same as v1), so their MP3s play stanza 1 only.
- **Timing failures:** v1 had 2 unsynced hymns (#106, #263), and Phase 2 reproduces exactly those. Those show words without
  highlighting and appear in the import report and the admin validation panel.
- **CDN pinning:** supabase-js and abcjs load from a CDN with pinned versions (plus SRI hashes
  where the CDN provides them).

---

## 4. Phase 0 status

- [x] Repo layout, `.gitignore`, `.env.example`, README stub
- [x] `docs/DEPLOY.md` (hosted setup steps, done by you)
- [x] Placeholder `web/index.html`
- [x] `web/config.example.js` and `web/config.js` (URL + publishable key)
- [x] This plan approved, including ✅1–✅5 (2026-10-01)
