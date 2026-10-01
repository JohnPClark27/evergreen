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

## 6. Public app config

`web/config.js` holds only the Supabase URL and the anon key (both safe to publish).
Copy `web/config.example.js` and fill them in. The service role key never goes here.

## 7. Restoring a paused Free project

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
