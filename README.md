# Hymnal Reader v2

An accessible daily Bible study for elderly residents in senior living (especially
residents with Alzheimer's), used **with an aide** on an iPad: Hymn → Scripture → Prayer.
Built for the Gloo AI Hackathon, Track 2 (Scripture Beyond the App).

> Work in progress. Full README comes in Phase 9. See [docs/PLAN.md](docs/PLAN.md)
> and [docs/DEPLOY.md](docs/DEPLOY.md).

## Parts

| Folder | What |
|---|---|
| `admin/` | PySide6 desktop app for managing hymns, prayers, studies, and plans |
| `pipeline/` | ABC import, MP3 render, lyric timing (ported from v1) |
| `supabase/` | SQL migrations + RLS, the YouVersion Edge Function, seed data |
| `web/` | Public static app (no build step), deployed on Cloudflare Pages |
| `docs/` | Plan, deploy runbook, testing, validation, licenses |

## Sources

- Hymns: [Open Hymnal Project](http://openhymnal.org/) (public domain)
- Prayers: [Open Prayer Book](https://github.com/freebcp/open-prayer-book) (BCP 1662/1979, public domain)
- Scripture: fetched at runtime from the YouVersion Platform API (never stored here)
