"""
data.py - the ONE place the admin app talks to Supabase.

Every write goes through this module, and every write also adds a row to
audit_log with the row's JSON before and after the change.

Uses the service role key from admin/.env (bypasses RLS). The key is never
logged, displayed, or written anywhere else.
"""
import getpass
import json
import os
import re
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

from dotenv import dotenv_values
from supabase import create_client

from books import CHAPTERS, ref_label

ENV_PATH = Path(__file__).resolve().parent / ".env"
STATUSES = ("draft", "approved", "published", "archived")
BUCKETS = ("hymn-abc", "hymn-audio", "hymn-timings")
FREE_STORAGE_BYTES = 1024 ** 3
STORAGE_TARGET_BYTES = 600 * 1024 ** 2

HYMN_COLUMNS = ("id,number,title,tune,first_line,meter,stanza_count,abc_path,audio_path,"
                "timing_path,timing_verified,is_familiar,status,notes,updated_at")
HYMN_EDITABLE = {"title", "tune", "first_line", "meter", "notes", "is_familiar"}
PRAYER_EDITABLE = {"slug", "title", "text", "source", "section", "attribution"}


class ConfigError(Exception):
    """admin/.env is missing or incomplete. .missing lists the variable names."""

    def __init__(self, missing):
        super().__init__(", ".join(missing))
        self.missing = missing


def load_config():
    """(url, service_key) from admin/.env (environment variables win)."""
    values = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    url = os.environ.get("SUPABASE_URL") or values.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or values.get("SUPABASE_SERVICE_ROLE_KEY")
    missing = [n for n, v in (("SUPABASE_URL", url), ("SUPABASE_SERVICE_ROLE_KEY", key)) if not v]
    if missing:
        raise ConfigError(missing)
    return url.rstrip("/"), key


def check_ref(book, chapter, verse_start, verse_end):
    """Problem with a scripture reference, as text, or None if it's fine."""
    if book not in CHAPTERS:
        return f"unknown book code {book!r}"
    if not isinstance(chapter, int) or not 1 <= chapter <= CHAPTERS[book]:
        return f"{book} has chapters 1-{CHAPTERS[book]}, not {chapter}"
    if verse_start is None and verse_end is not None:
        return "an end verse needs a start verse"
    if verse_start is not None and verse_start < 1:
        return "verses start at 1"
    if verse_end is not None and verse_end < verse_start:
        return "the end verse is before the start verse"
    return None


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.casefold()).strip("-")


class Data:
    def __init__(self, url, key):
        self.url = url
        self.sb = create_client(url, key)
        self.actor = f"admin:{getpass.getuser()}"

    # ------------------------------------------------------------------ reads

    def _all(self, table, columns="*", order=None, desc=False):
        """Every row (PostgREST pages at 1000)."""
        rows, start = [], 0
        while True:
            q = self.sb.table(table).select(columns)
            if order:
                q = q.order(order, desc=desc)
            page = q.range(start, start + 999).execute().data
            rows += page
            if len(page) < 1000:
                return rows
            start += 1000

    def _row(self, table, row_id):
        rows = self.sb.table(table).select("*").eq("id", row_id).execute().data
        if not rows:
            raise LookupError(f"{table} {row_id} not found")
        return rows[0]

    def hymns(self):
        return self._all("hymns", HYMN_COLUMNS, order="number")

    def hymn_refs(self, hymn_id):
        rows = (self.sb.table("hymn_scripture_refs").select("book,chapter,verse_start,verse_end")
                .eq("hymn_id", hymn_id).order("id").execute().data)
        return [(r["book"], r["chapter"], r["verse_start"], r["verse_end"]) for r in rows]

    def hymn_topics(self, hymn_id):
        rows = self.sb.table("hymn_topics").select("stanzas,topics(name)").eq("hymn_id", hymn_id).execute().data
        return sorted((r["topics"]["name"], r["stanzas"]) for r in rows)

    def topic_names(self):
        return [r["name"] for r in self._all("topics", "name", order="name")]

    def prayers(self):
        return self._all("prayers", "*", order="title")

    def status_counts(self):
        """{table: Counter(status -> n)} for the content tables."""
        return {t: Counter(r["status"] for r in self._all(t, "status"))
                for t in ("hymns", "prayers", "studies", "plans")}

    def storage_usage(self, progress=None):
        """{bucket: bytes}, summed from the bucket listings."""
        sizes = {}
        for i, bucket in enumerate(BUCKETS):
            if progress:
                progress(int(100 * i / len(BUCKETS)), f"Listing {bucket}...")
            total, offset = 0, 0
            while True:
                page = self.sb.storage.from_(bucket).list(
                    "", {"limit": 1000, "offset": offset, "sortBy": {"column": "name", "order": "asc"}})
                total += sum(int((o.get("metadata") or {}).get("size") or 0) for o in page)
                if len(page) < 1000:
                    break
                offset += 1000
            sizes[bucket] = total
        if progress:
            progress(100, "Storage listed")
        return sizes

    def validation_problems(self):
        """Things to fix, each {kind, label, page, row_id}. `page` is where to jump."""
        problems = []
        hymns = self._all("hymns", "id,number,title,status,is_familiar,audio_path,timing_verified", order="number")
        by_id = {h["id"]: h for h in hymns}
        for h in hymns:
            if h["status"] == "archived":
                continue
            name = f"#{h['number']} {h['title']}"
            if (h["is_familiar"] or h["status"] == "published") and not h["audio_path"]:
                problems.append({"kind": "Hymn missing audio", "label": name, "page": "hymns", "row_id": h["id"]})
            if not h["timing_verified"]:
                problems.append({"kind": "Unverified lyric timing", "label": name, "page": "hymns", "row_id": h["id"]})

        for r in self._all("hymn_scripture_refs", "hymn_id,book,chapter,verse_start,verse_end"):
            why = check_ref(r["book"], r["chapter"], r["verse_start"], r["verse_end"])
            h = by_id.get(r["hymn_id"])
            if why and h and h["status"] != "archived":
                problems.append({"kind": "Invalid scripture reference",
                                 "label": f"#{h['number']} {h['title']}: {r['book']} {r['chapter']} ({why})",
                                 "page": "hymns", "row_id": h["id"]})

        studies = self._all("studies", "id,title,status,hymn:hymns(title,status),prayer:prayers(title,status)")
        for s in studies:
            if s["status"] not in ("approved", "published"):
                continue
            for part in ("hymn", "prayer"):
                linked = s[part]
                if linked is None:
                    problems.append({"kind": "Study points to unpublished content",
                                     "label": f"{s['title']}: no {part} chosen", "page": "studies", "row_id": s["id"]})
                elif linked["status"] != "published":
                    problems.append({"kind": "Study points to unpublished content",
                                     "label": f"{s['title']}: {part} '{linked['title']}' is {linked['status']}",
                                     "page": "studies", "row_id": s["id"]})

        plans = {p["id"]: p for p in self._all("plans", "id,title,status")}
        days = {}
        for d in self._all("plan_days", "plan_id,day_number"):
            days.setdefault(d["plan_id"], []).append(d["day_number"])
        for plan_id, nums in days.items():
            nums.sort()
            if nums != list(range(1, len(nums) + 1)) and plans[plan_id]["status"] != "archived":
                missing = sorted(set(range(1, nums[-1] + 1)) - set(nums))
                problems.append({"kind": "Plan has gaps in its days",
                                 "label": f"{plans[plan_id]['title']}: missing day {', '.join(map(str, missing))}",
                                 "page": "plans", "row_id": plan_id})
        return problems

    def audit_log(self, limit=500, table=None):
        q = self.sb.table("audit_log").select("*").order("at", desc=True).limit(limit)
        if table:
            q = q.eq("table_name", table)
        return q.execute().data

    def public_url(self, bucket, key):
        return f"{self.url}/storage/v1/object/public/{bucket}/{urllib.parse.quote(key)}"

    def fetch_text(self, bucket, key):
        """A public Storage file as text (used for the read-only ABC view)."""
        with urllib.request.urlopen(self.public_url(bucket, key), timeout=20) as r:
            return r.read().decode("utf-8")

    # ----------------------------------------------------------------- writes
    # Each write: read the row before, change it, read it after, log both.

    def _audit(self, action, table, row_id, before, after):
        self.sb.table("audit_log").insert({
            "actor": self.actor, "action": action, "table_name": table,
            "row_id": None if row_id is None else str(row_id),
            "before": before, "after": after,
        }).execute()

    def _update(self, table, row_id, changes, action="update"):
        before = self._row(table, row_id)
        changes = {k: v for k, v in changes.items() if before.get(k) != v}
        if not changes:
            return before  # nothing changed: no write, no audit row
        after = self.sb.table(table).update(changes).eq("id", row_id).execute().data[0]
        self._audit(action, table, row_id, before, after)
        return after

    def _insert(self, table, values):
        after = self.sb.table(table).insert(values).execute().data[0]
        self._audit("insert", table, after.get("id"), None, after)
        return after

    def set_status(self, table, row_id, status):
        if status not in STATUSES:
            raise ValueError(f"unknown status {status!r}")
        return self._update(table, row_id, {"status": status}, action="status")

    def update_hymn(self, hymn_id, changes):
        bad = set(changes) - HYMN_EDITABLE
        if bad:
            raise ValueError(f"not editable here: {', '.join(sorted(bad))}")
        if "title" in changes and not (changes["title"] or "").strip():
            raise ValueError("A hymn needs a title.")
        return self._update("hymns", hymn_id, changes)

    def set_hymn_refs(self, hymn_id, refs):
        """Replace a hymn's scripture references: refs = [(book, chapter, vs, ve)]."""
        for r in refs:
            why = check_ref(*r)
            if why:
                raise ValueError(f"{ref_label(*r)}: {why}")
        before = self.hymn_refs(hymn_id)
        if sorted(before, key=str) == sorted(refs, key=str):
            return
        self.sb.table("hymn_scripture_refs").delete().eq("hymn_id", hymn_id).execute()
        if refs:
            self.sb.table("hymn_scripture_refs").insert([
                {"hymn_id": hymn_id, "book": b, "chapter": c, "verse_start": vs, "verse_end": ve}
                for b, c, vs, ve in refs]).execute()
        self._audit("update", "hymn_scripture_refs", hymn_id,
                    {"hymn_id": hymn_id, "refs": [list(r) for r in before]},
                    {"hymn_id": hymn_id, "refs": [list(r) for r in self.hymn_refs(hymn_id)]})

    def set_hymn_topics(self, hymn_id, topics):
        """Replace a hymn's topics: topics = [(name, stanzas or None)]. New names are created."""
        topics = sorted({(n.strip(), (s or "").strip() or None) for n, s in topics if n.strip()})
        before = self.hymn_topics(hymn_id)
        if before == topics:
            return
        known = {r["name"]: r["id"] for r in self._all("topics", "id,name")}
        for name, _ in topics:
            if name not in known:
                known[name] = self._insert("topics", {"name": name})["id"]
        self.sb.table("hymn_topics").delete().eq("hymn_id", hymn_id).execute()
        if topics:
            self.sb.table("hymn_topics").insert([
                {"hymn_id": hymn_id, "topic_id": known[n], "stanzas": s} for n, s in topics]).execute()
        self._audit("update", "hymn_topics", hymn_id,
                    {"hymn_id": hymn_id, "topics": [list(t) for t in before]},
                    {"hymn_id": hymn_id, "topics": [list(t) for t in self.hymn_topics(hymn_id)]})

    @staticmethod
    def _check_prayer(values):
        if "source" in values and not (values["source"] or "").strip():
            raise ValueError("A prayer needs a source (where the text comes from).")
        for field in ("title", "text", "slug"):
            if field in values and not (values[field] or "").strip():
                raise ValueError(f"A prayer needs a {field}.")

    def create_prayer(self, values):
        values = {k: v for k, v in values.items() if k in PRAYER_EDITABLE | {"status"}}
        values.setdefault("status", "draft")
        if not values.get("source"):
            values["source"] = ""  # let _check_prayer raise the friendly message
        self._check_prayer({f: values.get(f) for f in ("title", "text", "slug", "source")})
        return self._insert("prayers", values)

    def update_prayer(self, prayer_id, changes):
        bad = set(changes) - PRAYER_EDITABLE
        if bad:
            raise ValueError(f"not editable here: {', '.join(sorted(bad))}")
        self._check_prayer(changes)
        return self._update("prayers", prayer_id, changes)


def changed_fields(before, after):
    """[(field, old, new)] between two audit JSON blobs, for the Audit Log view."""
    before, after = before or {}, after or {}
    keys = [k for k in dict.fromkeys([*before, *after]) if k not in ("updated_at",)]
    return [(k, before.get(k), after.get(k)) for k in keys if before.get(k) != after.get(k)]


def short(value, width=80):
    s = value if isinstance(value, str) else json.dumps(value)
    return s if len(s) <= width else s[:width - 1] + "…"
