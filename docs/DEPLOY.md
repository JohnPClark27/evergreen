# Deploy

Everything runs on **hosted** services: a Supabase **Free** project and Cloudflare Pages.
We never run the local Supabase stack (no `supabase start`, no Docker).

> This file grows phase by phase. Phase 8 turns it into a full from-zero runbook.

## 1. One-time hosted setup (Phase 0, done by hand)

- [x] **Supabase project (Free tier).** From Project Settings → API, note:
  - project ref (`trdmlfbbmxogrxihcklw`)
  - URL (`https://trdmlfbbmxogrxihcklw.supabase.co`)
  - anon (or publishable) key: safe to publish, goes in `web/config.js`
  - service role key: **secret**, goes only in `admin/.env`, never in git
- [x] **Supabase CLI.** Install it, then:
  ```sh
  npx supabase login        # CLI is run via npx (not on PATH)
  npx supabase link --project-ref trdmlfbbmxogrxihcklw
  ```
  The link is stored in `supabase/.temp/` (gitignored).
- [x] **GitHub repo.** `https://github.com/JohnPClark27/hymnal-reader-v2`. Push `dev`.
- [x] **Cloudflare Pages.** Connect the repo:
  - Framework preset: none
  - Build command: *(empty)*
  - Build output directory: `web`
  - Preview deployments: on for `dev`

## 2. Allowed CLI commands (hosted only)

| Command | When |
|---|---|
| `npx supabase link --project-ref <ref>` | once per machine |
| `npx supabase db push` | apply `supabase/migrations/` to the hosted DB |
| `npx supabase functions deploy youversion` | Phase 5 |
| `npx supabase secrets set YOUVERSION_API_KEY=…` | Phase 5 (you paste the value) |

**Never:** `supabase start`, `supabase db reset` (local), or anything that needs Docker.
If the CLI can't do something, use the dashboard's **SQL Editor** instead.

## 3. Database schema and RLS (Phase 1)

```sh
npx supabase db push --dry-run     # see what would be applied
npx supabase db push               # apply supabase/migrations/ to the hosted DB
bash supabase/tests/rls_anon_test.sh
```

The test inserts throwaway draft and published rows through `npx supabase db query --linked`.
It then reads them with the **publishable key from `web/config.js`** and expects only the
published rows. It also tries to write and expects every attempt to be refused. Finally it
deletes the fixtures, even if a check fails.

## 4. Data pipeline and import (Phase 2)

One-time machine setup (Ubuntu/WSL). Only the apt step uses sudo:

```sh
./setup.sh                      # tools, Open Hymnal clone, .venv, timing builder deps
source .venv/bin/activate
```

Import (idempotent, safe to re-run; unchanged files are skipped by hash):

```sh
python pipeline/import_prayers.py --dry-run && python pipeline/import_prayers.py
python pipeline/import_hymns.py --dry-run   && python pipeline/import_hymns.py
```

| Option | Meaning |
|---|---|
| `--audio familiar` (default) / `all` / `none` | which hymns get MP3s uploaded |
| `--bitrate 96` or `MP3_BITRATE_KBPS` | mono MP3 bitrate |
| `--only 19 289` | just these hymn numbers |

- Prints the Storage bucket totals before and after each run, and refuses any audio upload
  past **900 MB**.
- Writes `pipeline/out/import-report.txt` listing unverified timings, single-stanza audio and
  render failures.
- Storage object keys contain a content hash (`019-f1dd05d3.mp3`), and files are served with
  `cache-control: max-age=31536000`. A changed file gets a new key, and the old object is deleted.
- New hymns arrive as `approved`, so publish them in the admin app. Prayers arrive as `published`.
  Re-imports never change status, `is_familiar`, notes, or hymn numbers.

## 5. Admin app (Phase 3)

```sh
source .venv/bin/activate        # PySide6 comes from requirements.txt (./setup.sh)
python admin/app.py
```

- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `admin/.env`. If they're missing,
  it shows a setup screen instead.
- Every write goes through `admin/data.py`, which also writes an `audit_log` row with
  before/after JSON. Unchanged saves write nothing.
- Network calls run in background threads (`admin/worker.py`), with progress in the status bar.
- Follows the system light/dark setting, with one stylesheet: `admin/style.qss`.
- WSL: runs on WSLg. Audio preview plays through WSLg's PulseAudio.

### Studies, plans, and the seed plan (Phase 4)

- **Studies:** pick a hymn (familiar filter), a passage (book/chapter/verses, with one-click
  suggestions from the hymn's scripture refs), a prayer, and an optional aide note of up to
  280 characters. The preview shows the session as the resident sees it: hymn verses, Scripture
  and prayer, plus the hymn audio. Scripture text is fetched live and never stored. It needs
  `YOUVERSION_API_KEY` in `admin/.env`, or the Phase 5 Edge Function.
- **Plans:**
  - drag days to reorder (Move up/down also work)
  - add an existing study, create a new one inline, or duplicate or remove a day
  - warnings flag the same hymn or prayer on back-to-back days, and unpublished studies
  - **Publish plan** checks that every day's study, hymn and prayer is published. If not, it
    lists them and changes nothing.
- **Seed plan** (once; refuses to run if the plan already exists):

  ```sh
  python supabase/seed/seed_memory_care_plan.py --dry-run
  python supabase/seed/seed_memory_care_plan.py
  ```

  Builds a **draft** "Memory Care — 30 Days" plan from `supabase/seed/memory_care_30.json`:
  - 30 short passages (references only)
  - familiar non-seasonal hymns, never repeated, preferring a hymn that cites the day's passage
  - the 15 prayers in rotation, so no prayer repeats on back-to-back days

  Every write goes through `admin/data.py`, so the whole seed appears in the Audit Log.

## 6. YouVersion Edge Function (Phase 5)

```sh
npx supabase secrets set YOUVERSION_API_KEY=…            # you paste this; never commit it
npx supabase db push                                    # includes the rate-limit table
npx supabase functions deploy youversion --use-api --no-verify-jwt
node supabase/functions/youversion/test.ts              # local unit tests (no network)
```

```
GET https://<ref>.supabase.co/functions/v1/youversion?book=PSA&chapter=23&start=1&end=3
200 {reference, book, chapter, verses:[{num,text}], version:{id,abbreviation,title}, attribution, source}
400 {error}   unknown book, chapter out of range, bad or missing verses
429 {error}   over the rate limit (Retry-After: 60)
```

- **`--use-api`** bundles on Supabase's servers, so no Docker is needed.
- **`--no-verify-jwt`** (also set in `config.toml`): the public app's `sb_publishable_…` key isn't
  a JWT. The function serves only public Scripture and protects itself in two ways:
  - **CORS:** browsers are allowed only from `hymnal-reader-v2.pages.dev`, its preview subdomains,
    and localhost. Any other browser origin gets a 403.
  - **Rate limit:** 60 requests a minute per client and 600 in total. The counters live in
    Postgres (`public.youversion_rate_hit`), because hosted functions don't keep memory between
    requests: each request usually gets a fresh instance (checked). Keys are salted SHA-256
    hashes, so no IPs are stored. The function uses the auto-injected **anon** key, never the
    service role key.
- **Caching:** YouVersion's docs say "Cache responses when possible", and the Terms of Use
  (last modified August 17, 2026) have no clause against it. So:
  - Chapter text is cached in memory for `YOUVERSION_CACHE_TTL_SECONDS` (default 86400; 0 = off).
  - Version and attribution metadata are cached for `YOUVERSION_META_TTL_SECONDS` (default 3600),
    kept short so the required attribution stays current.
  - Responses carry `Cache-Control: public, max-age=3600`.
  - Nothing is written to the database.
- **Attribution:** the version's `copyright`, else its `promotional_content` (YouVersion's rule).
  ASV has neither, so the fallback is "American Standard Version (ASV)". Every response then adds
  "· Scripture provided by YouVersion."
- **Settings** (optional secrets): `YOUVERSION_BIBLE_ID` (default 12, ASV),
  `ALLOWED_PAGES_HOSTS`, `RATE_LIMIT_PER_IP`, `RATE_LIMIT_TOTAL`.

## 7. Public app core (Phase 6)

- Modules: `web/js/{api,audio,speech,lyrics,sheet}.js`, styles `web/css/core.css`.
- CDN libraries are pinned with SRI: supabase-js 2.117.2 and abcjs 6.7.1. abcjs must stay at the
  pipeline's version.
- Test page: `https://dev.hymnal-reader-v2.pages.dev/dev/core-test`.
  1. Tap **Tap to start**.
  2. Press **Run the Phase 6 check**: the hymn plays with highlighted words, and after 15 s Psalm
     23:1-3 is read aloud while the music ducks to 25%.
  3. It needs a published hymn that has audio.

## 8. Public app config

`web/config.js` holds only the Supabase URL and the anon key (both safe to publish).
Copy `web/config.example.js` and fill them in. The service role key never goes here.

## 9. Restoring a paused Free project

Free projects pause after **7 days without activity**. Data is kept.

1. Open the Supabase dashboard and select the project. It shows **Paused**.
2. Click **Restore project** and wait a few minutes until it reports healthy.
3. Load the public app once and check that a hymn plays.

Projects paused for a long time (90+ days) may no longer be restorable from the
dashboard. Then you'd create a new project and re-run the runbook (migrations,
importers, function deploy). That's why everything is scripted.

**Optional keep-alive:** `.github/workflows/keepalive.yml` runs one tiny anon-key read
every 3 days. It ships **disabled**: the job only runs when the repo variable
`KEEPALIVE_ENABLED` is `true`. To enable it, add the repo secrets `SUPABASE_URL` and
`SUPABASE_ANON_KEY` (the publishable key, never the service role key), then set the
variable. Steps are in the workflow file's header. Phase 8 expands this.
