# Deploy

Hymnal Reader runs entirely on **hosted** services: a Supabase **Free** project (Postgres, Storage,
one Edge Function) and **Cloudflare Pages** (the static public app). It runs at **$0**. We never
run the local Supabase stack: no `supabase start`, no Docker. The Supabase CLI is always
`npx supabase …`.

| Piece | Where | Who uses which key |
|---|---|---|
| Public app (`web/`) | Cloudflare Pages: production `hymnal-reader-v2.pages.dev` (branch `main`), preview `dev.hymnal-reader-v2.pages.dev` (branch `dev`) | publishable/anon key in `web/config.js` (safe to publish) |
| Database + RLS | Supabase Postgres (`supabase/migrations/`) | the anon key reads **published** rows only |
| Hymn files | Supabase Storage, public buckets `hymn-abc`, `hymn-audio`, `hymn-timings` | anyone reads; only the service role writes |
| Scripture | Edge Function `youversion` (YouVersion key in Supabase secrets) | no key needed by callers; CORS + rate limit |
| Admin app + importers | your computer (`admin/`, `pipeline/`) | **service role key** from `admin/.env` (secret, never in git) |

---

## Part A: From zero (new project, step by step)

Use this to rebuild everything, e.g. on a new Supabase project. The current project ref is
`trdmlfbbmxogrxihcklw`.

### A1. Supabase project
1. Create a project on the **Free** plan.
2. From Project Settings → API, note:
   - the project ref and URL (`https://<ref>.supabase.co`)
   - the anon or **publishable** key: public, goes in `web/config.js`
   - the **service role** key: secret, goes only in `admin/.env`

### A2. This machine (Ubuntu / WSL)
```sh
git clone https://github.com/JohnPClark27/hymnal-reader-v2 && cd hymnal-reader-v2 && git checkout dev
./setup.sh          # apt tools (the only sudo step), Open Hymnal clone, .venv, timing-builder deps
cp .env.example admin/.env        # fill in SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; never commit it
source .venv/bin/activate
```

### A3. Link the CLI and create the database
```sh
npx supabase login
npx supabase link --project-ref <ref>       # stored in supabase/.temp/ (gitignored)
npx supabase db push --dry-run              # see what will be applied
npx supabase db push                        # schema, RLS, storage buckets, rate-limit table
bash supabase/tests/rls_anon_test.sh        # expect 19 passed (uses the key in web/config.js, so do A6 first on a new project)
```
If the CLI can't do something, paste the SQL from `supabase/migrations/` into the dashboard's
**SQL Editor** instead.

### A4. Scripture function
```sh
npx supabase secrets set YOUVERSION_API_KEY=…     # paste your YouVersion Platform App Key
npx supabase functions deploy youversion --use-api --no-verify-jwt
curl "https://<ref>.supabase.co/functions/v1/youversion?book=PSA&chapter=23&start=1&end=3"   # verses + attribution
```

### A5. Content
```sh
python pipeline/import_prayers.py                 # the 15 prayers, verbatim; published
python pipeline/import_hymns.py --dry-run && python pipeline/import_hymns.py
#   all 301 hymns (approved); MP3s for familiar hymns only; prints Storage totals
python supabase/seed/publish_pd_hymns.py --dry-run && python supabase/seed/publish_pd_hymns.py
#   publishes 40 well-known hymns that are fully public domain per their ABC files
python supabase/seed/seed_plan.py --title "Sample — 12 Days" --days 12 --publish
python supabase/seed/seed_plan.py                 # optional: "Memory Care — 30 Days" as a draft
```

### A6. Public app config
Copy `web/config.example.js` to `web/config.js` and fill in the URL and the anon/publishable key.
Commit it: both values are safe to publish. **Never** put the service role key there.

### A7. Cloudflare Pages
1. Workers & Pages → Create → Pages → Connect to Git → `hymnal-reader-v2`.
2. Settings: framework preset **None**, build command **empty**, build output directory **`web`**.
3. Production branch **`main`**, with preview deployments on (`dev` → `dev.<project>.pages.dev`).
4. If the Pages project name changes, set the function secret `ALLOWED_PAGES_HOSTS=<name>.pages.dev`
   so CORS lets the new site call Scripture.

### A8. Go live (production)
1. Check the **preview** first, using `docs/TESTING.md` (the automated checks and sections A–I).
2. **Merge `dev` → `main`** on GitHub (a pull request). Cloudflare deploys production automatically
   in about 1 minute.
3. Production smoke test: `docs/TESTING.md` section J.

### A9. Verify admin → public publishing
In the admin app (`python admin/app.py`), change a hymn's status and save, then **refresh** the
public app: the change shows up. There's nothing to redeploy. Content lives in the database, and
the public app reads it on load. (`docs/TESTING.md` I.)

---

## Part B: Day-to-day

| Task | How |
|---|---|
| Publish or unpublish hymns, prayers, studies, plans | Admin app. Every change goes to the **Audit Log**. A plan only publishes when every day's study, hymn and prayer is published. |
| Add a prayer | Admin app → Prayers → New. A **source is required**. Paste the text from the source; never write it. |
| Build a plan | Admin app → Studies (hymn + passage + prayer, with a live preview) → Plans (drag days, Publish). |
| Re-import after Open Hymnal changes | `python pipeline/import_hymns.py`: idempotent; unchanged files are skipped by hash; status, familiar flag, notes and numbers are never changed. |
| Add audio for more hymns | Mark them familiar in the admin app, then `python pipeline/import_hymns.py --only <numbers>`. Publish only hymns that pass the public-domain rule (`publish_pd_hymns.py`). |
| Ship public-app changes | Push to `dev` → check the preview → merge to `main`. |

---

## Part C: Reference

### Pipeline options (`pipeline/import_hymns.py`)
| Option | Meaning |
|---|---|
| `--audio familiar` (default) / `all` / `none` | which hymns get MP3s |
| `--bitrate 96` or `MP3_BITRATE_KBPS` | mono MP3 bitrate |
| `--only 19 289` | just these hymn numbers |
| `--dry-run` | show what would change |

- **Storage cap:** it refuses audio uploads past **900 MB**, and it writes
  `pipeline/out/import-report.txt` (unverified timings, single-stanza audio, render failures).
- **Object keys:** they contain a content hash (`019-f1dd05d3.mp3`), with
  `cache-control: max-age=31536000`. A changed file gets a new key, and the old one is deleted.

### Edge Function `youversion`
```
GET /functions/v1/youversion?book=PSA&chapter=23[&start=1&end=3]
200 {reference, book, chapter, verses:[{num,text}], version:{id,abbreviation,title}, attribution, source}
400 {error}  unknown book / chapter or verses out of range       429 {error} + Retry-After: 60
```
- **No JWT** (`--no-verify-jwt`, also in `config.toml`): the publishable key isn't a JWT. It's
  protected in two ways:
  - **CORS:** only `ALLOWED_PAGES_HOSTS` (default `hymnal-reader-v2.pages.dev`, plus its preview
    subdomains) and localhost. Any other browser origin gets a 403.
  - **Rate limit:** 60 per minute per client, 600 per minute in total. It's counted in Postgres
    (`public.youversion_rate_hit`) with salted hashes, so no IP addresses are stored.
- **Caching:** YouVersion's docs say "cache responses when possible", and their Terms of Use
  (August 17, 2026) don't forbid it.
  - Chapter text is cached in memory for `YOUVERSION_CACHE_TTL_SECONDS` (default 1 day; 0 = off).
  - Attribution is cached for `YOUVERSION_META_TTL_SECONDS` (default 1 h).
  - Responses carry `Cache-Control: public, max-age=3600`.
  - **Scripture is never written to the database.**
- **Attribution:** the version's copyright, else its promotional text, else its name, then
  "· Scripture provided by YouVersion." ASV shows "American Standard Version (ASV) · Scripture
  provided by YouVersion."
- **Optional secrets:** `YOUVERSION_BIBLE_ID` (default 12 = ASV), `RATE_LIMIT_PER_IP`,
  `RATE_LIMIT_TOTAL`.
- **Unit tests:** `node supabase/functions/youversion/test.ts`.

### Admin app
- **Run:** `python admin/app.py`. If `admin/.env` is missing a key, it shows a setup screen.
- **Writes:** every write goes through `admin/data.py` and is recorded in `audit_log` with
  before/after JSON.
- **Responsiveness:** background calls run one at a time (`admin/worker.py`), so the window never
  freezes.
- **Scripture preview** in Studies uses the Edge Function, or `YOUVERSION_API_KEY` in `admin/.env`
  if you add one.

### Public app
- **Files:** `web/index.html` → `js/app.js` (hash router). Screens are in `js/screens/`, core
  modules in `js/{api,audio,speech,lyrics,sheet}.js`.
- **CDN libraries** are pinned with SRI hashes: supabase-js 2.117.2 and abcjs 6.7.1. abcjs must
  match the pipeline's version so the sheet-music cursor lines up.
- **Stored on the tablet:** only `localStorage` (`hr.progress`, `hr.sessionStep`, `hr.hymnNotes`,
  `hr.settings`, `hr.lastSession`). No accounts, no names, no analytics.
- **Developer test page:** `/dev/core-test` (Phase 6).

---

## Part D: Running on the Free tier

### Limits to watch
| Limit | Free tier | Now |
|---|---|---|
| Database | 500 MB | a few MB (text and metadata only) |
| Storage | 1 GB | **107 MB** (50 MP3s ≈ 100 MB, ABC + timings ≈ 7.5 MB) |
| Egress | 5 GB / month | depends on use: see the math below |
| Inactivity | the project **pauses after 7 days** without requests | keep-alive optional |

The dashboard card in the admin app shows Storage use against 1 GB, plus the pause reminder.

### Cost note
Everything is **$0**: Supabase Free plus Cloudflare Pages Free. Pages bandwidth for the app
itself (HTML, JS, CSS) is free and unmetered. The fonts and CDN libraries come from Google Fonts
and jsDelivr, not from Supabase. What counts against Supabase's **5 GB/month egress** is mostly
hymn audio.

**Rough math (worst case, nothing cached by the browser):**

| Item | Size |
|---|---|
| One hymn MP3 (average of the 50; max 3.7 MB) | **≈ 2.0 MB** |
| Its timing/words file | ≈ 0.02 MB |
| Plan, hymn list, Scripture JSON per session | < 0.05 MB |
| **One session** (one hymn + its words + Scripture) | **≈ 2.1 MB** |

- 5 GB ≈ 5,120 MB ÷ 2.1 MB ≈ **2,400 hymn plays a month**.
- One tablet doing **1 session + 2 extra hymns a day** ≈ 3 × 2.0 MB ≈ 6 MB/day ≈ **180 MB/month**.
- So the Free tier covers about **25–28 tablets** at that pace. In practice it's more:
  - MP3s are fetched once per visit and kept for the session.
  - Storage sends `cache-control: max-age=31536000`, so the browser can often reuse a hymn it
    played on an earlier day without downloading it again.

**Storage:** the 40 published hymns plus 10 more with audio use 107 MB. Audio for **all** 301
hymns would be about 640 MB, which is still under 1 GB but over the 600 MB target. Keep audio to
hymns you'll actually use.

### Restoring a paused Free project
Free projects pause after **7 days with no requests**. Nothing is lost.
1. Supabase dashboard → the project shows **Paused** → **Restore project**.
2. Wait a few minutes until it's healthy.
3. Open the public app and play a hymn to confirm.

A project paused for a long time (around 90 days) may no longer be restorable from the
dashboard. Then create a new project and follow **Part A** again. Every step is scripted, and
content comes back from the importers and seed scripts. Hymn and prayer notes on tablets are
local and unaffected.

### Optional keep-alive (ships disabled)
`.github/workflows/keepalive.yml` makes one tiny read with the **public** key every 3 days, so the
project never sits idle for 7. It's off until you turn it on:
1. GitHub repo → Settings → Secrets and variables → Actions → **Secrets**: add `SUPABASE_URL`
   (`https://<ref>.supabase.co`) and `SUPABASE_ANON_KEY` (the publishable key, **never** the
   service role key).
2. Same page → **Variables**: add `KEEPALIVE_ENABLED` = `true`.
3. Actions tab → **keepalive** → **Run workflow** once to test. It should finish green.

Notes:
- Scheduled workflows only run from the **default branch** (`main`), so it starts after `dev` is
  merged.
- GitHub pauses scheduled workflows in a repo with no commits for 60 days. Re-enable it from the
  Actions tab if that happens.
- To turn it off, delete the variable or set it to `false`.

### Upgrading to Pro later (no code changes)
Nothing in the code depends on a plan: Postgres, RLS, public Storage buckets and Edge Functions
all work the same on Free and Pro.
1. Supabase dashboard → Organization → Billing → upgrade the organization to **Pro**.
2. Done. Pro projects don't pause, and the storage and egress limits go up.
3. Optional: turn the keep-alive off (`KEEPALIVE_ENABLED` = `false`), since it's no longer needed.

Keep the importer's 900 MB cap, or raise `AUDIO_CAP_BYTES` in `pipeline/supa.py` if you want
audio for every hymn.
