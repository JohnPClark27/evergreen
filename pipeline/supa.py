"""
supa.py - shared Supabase helpers for the pipeline scripts.

Loads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env in the repo root (or the older admin/.env).
The service role key bypasses RLS: it is only ever read from the local .env and
is never printed.
"""
import getpass
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "pipeline" / "out"   # local build cache (gitignored)

BUCKETS = ("hymn-abc", "hymn-audio", "hymn-timings")
CACHE_SECONDS = 31536000          # 1 year: object keys contain a content hash, so this is safe
MB = 1024 * 1024
AUDIO_CAP_BYTES = 900 * MB        # refuse uploads that would push Storage past this
STORAGE_TARGET_BYTES = 600 * MB   # what we aim to stay under (Free tier is 1 GB)


def load_env():
    for p in (ROOT / ".env", ROOT / "admin" / ".env"):  # admin/.env: where it lived before the Studio
        if p.exists():
            load_dotenv(p, override=False)


def client():
    load_env()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing: copy .env.example to .env (repo root) and fill it in.")
    return create_client(url, key)


def actor(tool):
    """Who to record in audit_log, e.g. 'pipeline:jpcli'."""
    return f"{tool}:{getpass.getuser()}"


def select_all(sb, table, columns="*"):
    """Every row of a table (PostgREST returns at most 1000 per request)."""
    rows, start = [], 0
    while True:
        page = sb.table(table).select(columns).range(start, start + 999).execute().data
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def list_objects(sb, bucket):
    """All objects in a (flat) bucket: [{name, size}]."""
    out, offset = [], 0
    while True:
        page = sb.storage.from_(bucket).list("", {"limit": 1000, "offset": offset,
                                                  "sortBy": {"column": "name", "order": "asc"}})
        for o in page:
            if o.get("metadata"):  # folders have no metadata
                out.append({"name": o["name"], "size": int(o["metadata"].get("size") or 0)})
        if len(page) < 1000:
            return out
        offset += 1000


def bucket_sizes(sb):
    """{bucket: total bytes} for our buckets."""
    return {b: sum(o["size"] for o in list_objects(sb, b)) for b in BUCKETS}


def fmt_sizes(sizes):
    total = sum(sizes.values())
    parts = ", ".join(f"{b} {s / MB:.1f} MB" for b, s in sizes.items())
    return f"{parts}  |  total {total / MB:.1f} MB of 1024 MB (target {STORAGE_TARGET_BYTES // MB}, cap {AUDIO_CAP_BYTES // MB})"


def upload(sb, bucket, key, data, content_type):
    """Upload bytes with a long cache lifetime (overwrites an object with the same key)."""
    sb.storage.from_(bucket).upload(
        key, data,
        {"content-type": content_type, "cache-control": str(CACHE_SECONDS), "upsert": "true"},
    )


def public_url(bucket, key):
    load_env()
    return f"{os.environ['SUPABASE_URL']}/storage/v1/object/public/{bucket}/{key}"
