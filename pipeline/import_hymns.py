"""
import_hymns.py - Open Hymnal ABC files -> Supabase (hosted).

For every hymn:
  1. parse metadata (abc_meta.py)
  2. render a mono MP3 if its audio is wanted (render_mp3.sh, cached in pipeline/out/mp3/)
  3. build lyric timings (timings/build_timings.mjs, one Node run for all hymns)
  4. upload ABC / MP3 / timing JSON to Storage, skipping files whose hash is unchanged
  5. upsert hymns, hymn_scripture_refs, topics, hymn_topics

Audio defaults to FAMILIAR hymns only (--audio all to override). ABC and timing files
(small) upload for every hymn. Audio uploads stop before Storage would pass 900 MB.

New hymns are imported as 'approved' (publish them in the admin app). Re-imports never
change status, is_familiar, notes, or a hymn's number.

Usage (from the repo root, with the venv active):
  python pipeline/import_hymns.py --dry-run
  python pipeline/import_hymns.py
  python pipeline/import_hymns.py --audio all
  python pipeline/import_hymns.py --only 19 289        # just these hymn numbers
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

import abc_meta
import supa

HERE = Path(__file__).resolve().parent
OUT = supa.OUT

# kind -> (bucket, file extension, content type)
FILES = {
    "abc": ("hymn-abc", "abc", "text/plain"),
    "audio": ("hymn-audio", "mp3", "audio/mpeg"),
    "timing": ("hymn-timings", "json", "application/json"),
}
PATH_COLUMN = {"abc": "abc_path", "audio": "audio_path", "timing": "timing_path"}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def object_key(number, digest, ext):
    # The hash is part of the name: a changed file gets a new URL, so a 1-year cache is safe.
    return f"{number:03d}-{digest[:8]}.{ext}"


# ---------------------------------------------------------------------------
# Familiar list
# ---------------------------------------------------------------------------

def load_familiar():
    """[(title, tune or None)] from familiar.txt."""
    entries = []
    for line in (HERE / "familiar.txt").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        title, _, tune = line.partition("|")
        entries.append((title.strip().casefold(), tune.strip().casefold() or None))
    return entries


def is_familiar(h, entries):
    for title, tune in entries:
        if h["title"].casefold() == title and (tune is None or (h["tune"] or "").casefold() == tune):
            return True
    return False


# ---------------------------------------------------------------------------
# Render MP3s (cached by ABC hash + bitrate)
# ---------------------------------------------------------------------------

def cached_mp3(number, abc_hash, bitrate):
    """Path of an up-to-date cached render, or None."""
    mp3, meta = OUT / "mp3" / f"{number:03d}.mp3", OUT / "mp3" / f"{number:03d}.json"
    if mp3.exists() and meta.exists():
        m = json.loads(meta.read_text())
        if m.get("abc") == abc_hash and m.get("bitrate") == bitrate:
            return mp3
    return None


def render(h, bitrate, oh_dir):
    mp3, meta = OUT / "mp3" / f"{h['number']:03d}.mp3", OUT / "mp3" / f"{h['number']:03d}.json"
    env = {**os.environ, "MP3_BITRATE_KBPS": str(bitrate), "OPENHYMNAL_DIR": str(oh_dir)}
    r = subprocess.run(["bash", str(HERE / "render_mp3.sh"), str(h["path"]), str(mp3)],
                       env=env, capture_output=True, text=True)
    if r.returncode != 0:
        return None, (r.stderr.strip() or "render failed")
    meta.write_text(json.dumps({"abc": h["hash"]["abc"], "bitrate": bitrate,
                                "single_pass": "single-pass" in r.stdout}))
    return mp3, None


# ---------------------------------------------------------------------------
# Timings (one Node run for the whole batch)
# ---------------------------------------------------------------------------

def build_timings(hymns, oh_dir):
    manifest = OUT / "timings-manifest.json"
    manifest.write_text(json.dumps([{
        "number": h["number"], "title": h["title"], "tune": h["tune"],
        "abc": str(h["path"]), "mp3": str(h["mp3"]) if h["mp3"] else None,
        "out": str(OUT / "timings" / f"{h['number']:03d}.json"),
    } for h in hymns]))
    r = subprocess.run(["node", str(HERE / "timings" / "build_timings.mjs"), str(manifest)],
                       env={**os.environ, "OPENHYMNAL_DIR": str(oh_dir)},
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"Timing builder failed:\n{r.stderr}")
    return {d["number"]: d for d in map(json.loads, r.stdout.splitlines())}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", help="Open Hymnal 'Complete' folder (default $OPENHYMNAL_DIR/Complete)")
    ap.add_argument("--audio", choices=["familiar", "all", "none"], default="familiar",
                    help="which hymns get MP3s uploaded (default: familiar)")
    ap.add_argument("--bitrate", type=int, help="MP3 bitrate in kbps (default $MP3_BITRATE_KBPS or 96)")
    ap.add_argument("--only", type=int, nargs="+", metavar="N", help="only these hymn numbers")
    ap.add_argument("--dry-run", action="store_true", help="show what would change; write nothing remote")
    args = ap.parse_args()

    supa.load_env()
    oh_dir = Path(os.path.expanduser(os.environ.get("OPENHYMNAL_DIR", "~/openhymnal"))).resolve()
    src = Path(os.path.expanduser(args.src)) if args.src else oh_dir / "Complete"
    bitrate = args.bitrate or int(os.environ.get("MP3_BITRATE_KBPS") or 96)
    for d in ("mp3", "timings"):
        (OUT / d).mkdir(parents=True, exist_ok=True)

    sb = supa.client()
    print(f"{'DRY RUN: ' if args.dry_run else ''}Open Hymnal: {src}  |  audio: {args.audio} @ {bitrate} kbps mono")
    sizes_before = supa.bucket_sizes(sb)
    print(f"Storage before: {supa.fmt_sizes(sizes_before)}")

    # --- 1. Parse every file; give each a stable number -----------------------
    existing = {r["source_file"]: r for r in supa.select_all(
        sb, "hymns", "id,number,source_file,is_familiar,file_hashes,abc_path,audio_path,timing_path")}
    next_number = max([r["number"] for r in existing.values()], default=0) + 1
    familiar = load_familiar()

    hymns, report = [], {"render_failed": [], "single_pass": [], "bad_refs": [], "refused_audio": []}
    for path in abc_meta.hymn_files(src):
        h = abc_meta.parse_abc(path, src)
        old = existing.get(h["source_file"])
        if old:
            h["number"], h["is_familiar"] = old["number"], old["is_familiar"]
        else:
            # New files are numbered after everything already in the DB, in sorted order,
            # so numbers never shift. On an empty DB this gives 1..N like v1.
            h["number"], h["is_familiar"] = next_number, is_familiar(h, familiar)
            next_number += 1
        h["old"] = old
        h["abc_bytes"] = h["text"].encode("utf-8")   # always uploaded as UTF-8
        h["hash"] = {"abc": sha256(h["abc_bytes"])}
        report["bad_refs"] += [(h["number"], b) for b in h["bad_refs"]]
        hymns.append(h)

    matched = {(t, n) for t, n in familiar if any(
        x["title"].casefold() == t and (n is None or (x["tune"] or "").casefold() == n) for x in hymns)}
    report["familiar_unmatched"] = [t if n is None else f"{t} | {n}" for t, n in familiar if (t, n) not in matched]

    if args.only:
        hymns = [h for h in hymns if h["number"] in set(args.only)]
    print(f"Parsed {len(hymns)} hymns ({sum(h['old'] is None for h in hymns)} new, "
          f"{sum(h['is_familiar'] for h in hymns)} familiar)")

    # --- 2. Render MP3s where audio is wanted ---------------------------------
    def wants_audio(h):
        return args.audio == "all" or (args.audio == "familiar" and h["is_familiar"])

    to_render = []
    for h in hymns:
        h["mp3"] = cached_mp3(h["number"], h["hash"]["abc"], bitrate)
        if wants_audio(h) and not h["mp3"]:
            to_render.append(h)
    if to_render and args.dry_run:
        print(f"Would render {len(to_render)} MP3s")
    elif to_render:
        print(f"Rendering {len(to_render)} MP3s (about 7 s each, {os.cpu_count()} at a time)...")
        with ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
            for h, (mp3, err) in zip(to_render, pool.map(lambda h: render(h, bitrate, oh_dir), to_render)):
                h["mp3"] = mp3
                if err:
                    report["render_failed"].append((h["number"], h["title"], err))
                print(f"  {h['number']:3d} {h['title']}: {'FAILED' if err else 'ok'}")
    for h in hymns:
        meta = OUT / "mp3" / f"{h['number']:03d}.json"
        if h["mp3"] and json.loads(meta.read_text()).get("single_pass"):
            report["single_pass"].append((h["number"], h["title"]))

    # --- 3. Timings -----------------------------------------------------------
    print("Building lyric timings...")
    timings = build_timings(hymns, oh_dir)
    for h in hymns:
        t = timings[h["number"]]
        h["timing_verified"] = t["synced"]
        h["timing_reason"] = t["reason"]
        h["stanza_count"] = t["stanzaCount"]
        h["first_line"] = t["firstLine"] or h["first_line"]
        h["timing_bytes"] = (OUT / "timings" / f"{h['number']:03d}.json").read_bytes() if t["written"] else None
        if h["timing_bytes"]:
            h["hash"]["timing"] = sha256(h["timing_bytes"])
        if h["mp3"] and wants_audio(h):
            h["audio_bytes"] = h["mp3"].read_bytes()
            h["hash"]["audio"] = sha256(h["audio_bytes"])

    # --- 4. Upload changed files ----------------------------------------------
    total = sum(sizes_before.values())
    uploads = {k: 0 for k in FILES}
    for h in hymns:
        old_hashes = (h["old"] or {}).get("file_hashes") or {}
        h["new_hashes"], h["new_paths"] = dict(old_hashes), {}
        for kind, (bucket, ext, ctype) in FILES.items():
            digest = h["hash"].get(kind)
            if not digest or digest == old_hashes.get(kind):
                continue  # nothing to upload, or unchanged
            data = {"abc": h["abc_bytes"], "audio": h.get("audio_bytes"), "timing": h["timing_bytes"]}[kind]
            if kind == "audio" and total + len(data) > supa.AUDIO_CAP_BYTES:
                report["refused_audio"].append((h["number"], h["title"], len(data)))
                continue
            key = object_key(h["number"], digest, ext)
            uploads[kind] += 1
            total += len(data)
            if args.dry_run:
                continue
            supa.upload(sb, bucket, key, data, ctype)
            old_key = (h["old"] or {}).get(PATH_COLUMN[kind])
            if old_key and old_key != key:
                sb.storage.from_(bucket).remove([old_key])  # don't leave the old version behind
            h["new_hashes"][kind] = digest
            h["new_paths"][PATH_COLUMN[kind]] = key
    print("Uploads " + ("planned" if args.dry_run else "done") + ": " +
          ", ".join(f"{k} {n}" for k, n in uploads.items()))

    # --- 5. Database ------------------------------------------------------------
    def meta_row(h):
        return {
            "source_file": h["source_file"], "number": h["number"], "title": h["title"],
            "tune": h["tune"], "first_line": h["first_line"], "meter": h["meter"],
            "stanza_count": h["stanza_count"], "timing_verified": h["timing_verified"],
            "file_hashes": h.get("new_hashes", {}),
            **{c: ((h["old"] or {}).get(c)) for c in PATH_COLUMN.values()},
            **h.get("new_paths", {}),
        }

    new = [h for h in hymns if h["old"] is None]
    old = [h for h in hymns if h["old"] is not None]
    if args.dry_run:
        print(f"Would insert {len(new)} hymns and update {len(old)}")
    else:
        if new:
            sb.table("hymns").insert([{**meta_row(h), "status": "approved", "is_familiar": h["is_familiar"]}
                                      for h in new]).execute()
        if old:
            # merge-duplicates: only these columns change; status/is_familiar/notes are left alone
            sb.table("hymns").upsert([meta_row(h) for h in old], on_conflict="source_file").execute()

        ids = {r["source_file"]: r["id"] for r in supa.select_all(sb, "hymns", "id,source_file")}
        hymn_ids = [ids[h["source_file"]] for h in hymns]

        # Scripture refs and topics are re-derived from the ABC each time: replace them.
        for chunk in range(0, len(hymn_ids), 200):
            part = hymn_ids[chunk:chunk + 200]
            sb.table("hymn_scripture_refs").delete().in_("hymn_id", part).execute()
            sb.table("hymn_topics").delete().in_("hymn_id", part).execute()
        refs = [{"hymn_id": ids[h["source_file"]], "book": b, "chapter": c, "verse_start": vs, "verse_end": ve}
                for h in hymns for b, c, vs, ve in h["refs"]]
        if refs:
            sb.table("hymn_scripture_refs").insert(refs).execute()
        names = sorted({t for h in hymns for t, _ in h["topics"]})
        if names:
            sb.table("topics").upsert([{"name": n} for n in names], on_conflict="name",
                                      ignore_duplicates=True).execute()
        topic_ids = {r["name"]: r["id"] for r in supa.select_all(sb, "topics", "id,name")}
        links = [{"hymn_id": ids[h["source_file"]], "topic_id": topic_ids[t], "stanzas": s}
                 for h in hymns for t, s in h["topics"]]
        if links:
            sb.table("hymn_topics").insert(links).execute()

    # --- 6. Report --------------------------------------------------------------
    sizes_after = sizes_before if args.dry_run else supa.bucket_sizes(sb)
    unsynced = [(h["number"], h["title"], h["timing_reason"]) for h in hymns if not h["timing_verified"]]
    lines = [
        f"Hymn import report  {datetime.now():%Y-%m-%d %H:%M}{'  (DRY RUN)' if args.dry_run else ''}",
        f"Hymns: {len(hymns)} ({len(new)} new, {len(old)} existing)  |  familiar: {sum(h['is_familiar'] for h in hymns)}",
        f"Uploads: " + ", ".join(f"{k} {n}" for k, n in uploads.items()),
        f"Storage before: {supa.fmt_sizes(sizes_before)}",
        f"Storage after:  {supa.fmt_sizes(sizes_after)}" if not args.dry_run else
        f"Storage after (estimated): {total / supa.MB:.1f} MB",
        "",
        f"Timing NOT verified ({len(unsynced)}): words show without highlighting",
        *[f"  #{n} {t}: {r}" for n, t, r in unsynced],
    ]
    for label, key in (("MP3 render failed", "render_failed"), ("Audio REFUSED (900 MB cap)", "refused_audio"),
                       ("Single-stanza MP3 only", "single_pass"), ("Unparsed scripture refs", "bad_refs"),
                       ("familiar.txt entries with no matching hymn", "familiar_unmatched")):
        if report[key]:
            lines += ["", f"{label} ({len(report[key])}):", *[f"  {x}" for x in report[key]]]
    text = "\n".join(lines)
    print("\n" + text)
    (OUT / "import-report.txt").write_text(text + "\n")
    print(f"\n(saved to {(OUT / 'import-report.txt').relative_to(supa.ROOT)})")

    if not args.dry_run:
        sb.table("audit_log").insert({
            "actor": supa.actor("pipeline"), "action": "import", "table_name": "hymns",
            "after": {"hymns": len(hymns), "new": len(new), "uploads": uploads,
                      "unsynced": [n for n, _, _ in unsynced], "storage_bytes": sum(sizes_after.values())},
        }).execute()


if __name__ == "__main__":
    main()
