# Archive

Code that is no longer used by the app, kept for reference. Nothing here is served
(Cloudflare Pages publishes `web/` only) or imported.

| File | What it was | Why it was archived |
|---|---|---|
| `myday.js` | The **My Day** screen (`#/myday`, `#/myday/play`): the next study of the plan used last, with AI "Added for you" parts and 👍/👎. Was `web/js/screens/myday.js`. | Replaced by **Chosen for you** (`#/today`) after the mood check-in (2026-10-07). To restore: move it back to `web/js/screens/`, and add its import and the two routes in `web/js/app.js`. |
