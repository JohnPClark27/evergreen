"""
publish_pd_hymns.py - publish the well-known hymns whose ABC files show they are FULLY
public domain, using a strict rule (so the choice is repeatable and auditable).

A hymn qualifies when its ABC file:
  1. says "copyright: public domain" in a C: line, and
  2. has no caveat: no C:/S: credit line that cites a source or setting from 1928 or later
     (e.g. transcribed from 'Lutheran Worship' 1982, a 1931 or 1940 hymnal, or a claim that
     rests on a copyright "never renewed"). The file's own housekeeping lines ("Open Hymnal
     Project, 2008 Revision", "contributed ... 2012") don't count.
     Exception: a modern setting the arranger explicitly "released ... to the public domain"
     is fully public domain (a dedication), so it qualifies.

Candidates are the familiar hymns plus the extra well-known titles in EXTRA. Only hymns with
audio are published. Changes are summarised in one audit_log row per run. The Studio's Hymns page applies the same
rule (web/studio/js/pd.js) when an admin publishes one hymn.

Usage (repo root, venv active):
  python supabase/seed/publish_pd_hymns.py --dry-run
  python supabase/seed/publish_pd_hymns.py
"""
import argparse
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import abc_meta  # noqa: E402  (pipeline/abc_meta.py: encoding-safe ABC reading)
import supa  # noqa: E402  (pipeline/supa.py: service-role client from .env)

TARGET = 40
# Well-known hymns added beyond the familiar list (they must also pass the rule).
EXTRA = {170, 83, 67, 169}  # My Hope Is Built, God Will Take Care of You, Faith of Our Fathers,
#                             My Faith Looks Up To Thee
HOUSEKEEPING = re.compile(r"Open Hymnal Project, \d{4} Revision|contributed to the Open Hymnal", re.I)
DEDICATED = re.compile(r"released (in)?to the public domain|released .* to the public domain", re.I)


def pd_check(abc_text):
    """(ok, reason) for one ABC file under the strict rule above."""
    credits = [l.strip() for l in abc_text.splitlines() if re.match(r"^[CS]:", l)]
    if not any(re.search(r"copyright:\s*public domain", l, re.I) for l in credits):
        return False, "no 'copyright: public domain' line"
    dedicated = any(DEDICATED.search(l) for l in credits)
    for line in credits:
        if HOUSEKEEPING.search(line) or DEDICATED.search(line):
            continue  # file housekeeping, or the dedication statement itself
        if re.search(r"never renewed", line, re.I):
            return False, f"relies on non-renewal: {line[:90]}"
        modern = [int(y) for y in re.findall(r"\b(19[2-9]\d|20\d\d)\b", line) if int(y) >= 1928]
        if modern and not (dedicated and re.search(r"setting|arrang|versification", line, re.I)):
            return False, f"modern source/setting ({modern[0]}): {line[:90]}"
    return True, "dedicated to the public domain" if dedicated else "public domain"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    sb = supa.client()
    src = Path(os.path.expanduser(os.environ.get("OPENHYMNAL_DIR", "~/openhymnal"))) / "Complete"
    hymns = supa.select_all(sb, "hymns", "id,number,title,status,is_familiar,audio_path,source_file")
    hymns.sort(key=lambda h: h["number"])
    files = {h["id"]: h["source_file"] for h in hymns}

    chosen, rejected = [], []
    for h in hymns:
        if not (h["is_familiar"] or h["number"] in EXTRA):
            continue
        ok, why = pd_check(abc_meta.read_text(src / files[h["id"]]))
        if ok and not h["audio_path"]:
            ok, why = False, "no audio uploaded"
        (chosen if ok else rejected).append((h, why))

    print(f"Qualify ({len(chosen)}):")
    for h, why in chosen:
        print(f"  #{h['number']:<3} {h['title']}  [{h['status']}; {why}]")
    print(f"\nExcluded ({len(rejected)}):")
    for h, why in rejected:
        print(f"  #{h['number']:<3} {h['title']}: {why}")
    if len(chosen) != TARGET:
        sys.exit(f"\nExpected {TARGET} qualifying hymns, found {len(chosen)}: adjust EXTRA. Nothing published.")
    if args.dry_run:
        print("\nDry run: nothing published.")
        return
    changed = [h for h, _ in chosen if h["status"] != "published"]
    for h in changed:
        sb.table("hymns").update({"status": "published"}).eq("id", h["id"]).execute()
    # One audit row for the whole run (like the importers).
    sb.table("audit_log").insert({"actor": supa.actor("pipeline"), "action": "publish", "table_name": "hymns",
                                  "after": {"published": [h["number"] for h in changed], "rule": "publish_pd_hymns.py"}}).execute()
    print(f"\nPublished {len(changed)} hymns ({TARGET - len(changed)} were already published).")


if __name__ == "__main__":
    main()
