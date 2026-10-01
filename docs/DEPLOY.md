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
  supabase login
  supabase link --project-ref trdmlfbbmxogrxihcklw
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
| `supabase link --project-ref <ref>` | once per machine |
| `supabase db push` | apply `supabase/migrations/` to the hosted DB |
| `supabase functions deploy youversion` | Phase 5 |
| `supabase secrets set YOUVERSION_API_KEY=…` | Phase 5 (you paste the value) |

**Never:** `supabase start`, `supabase db reset` (local), or anything that needs Docker.
If the CLI can't do something, use the dashboard's **SQL Editor** instead.

## 3. Public app config

`web/config.js` holds only the Supabase URL and the anon key (both safe to publish).
Copy `web/config.example.js` and fill them in. The service role key never goes here.

## 4. Restoring a paused Free project

Free projects pause after **7 days without activity**. Data is kept.

1. Open the Supabase dashboard and select the project. It shows **Paused**.
2. Click **Restore project** and wait a few minutes until it reports healthy.
3. Load the public app once and check that a hymn plays.

Projects paused for a long time (90+ days) may no longer be restorable from the
dashboard. Then you'd create a new project and re-run the runbook (migrations,
importers, function deploy). That's why everything is scripted.

**Optional keep-alive:** `.github/workflows/keepalive.yml` (added in Phase 1, once there's
a table to query) runs one tiny anon-key read every 3 days. It ships **disabled**.
Phase 8 explains how to turn it on.
