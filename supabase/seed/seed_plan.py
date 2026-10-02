"""
seed_plan.py - build a starter plan from supabase/seed/memory_care_30.json.

Default: the "Memory Care — 30 Days" plan as a DRAFT (30 draft studies).
With --title/--days/--publish: e.g. a published 12-day sample plan built only from
PUBLISHED hymns (see publish_pd_hymns.py), with its studies and the plan published.

Each day = one familiar hymn + one short comforting passage (from memory_care_30.json,
references only) + one of the 15 prayers (rotating, never the same two days running).
Hymns: familiar, with audio, not seasonal (Christmas/Easter-only), never repeated.
A hymn whose own scripture refs cover most of the day's passage is preferred.

All writes go through admin/data.py, so every insert is in the Audit Log.
Studies and the plan are created as 'draft' for review in the admin app.

An existing study with the same hymn, passage, and prayer is reused instead of duplicated.

Usage (repo root, venv active):
  python supabase/seed/seed_plan.py --dry-run
  python supabase/seed/seed_plan.py                                   # Memory Care, draft
  python supabase/seed/seed_plan.py --title "Sample — 12 Days" --days 12 --publish
"""
import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "admin"))

import data  # noqa: E402  (admin/data.py)
from books import ref_label  # noqa: E402


def overlap(ref, passage):
    """How much of the passage a hymn scripture ref (book, ch, vs, ve) covers:
    the number of shared verses, 0.5 for a whole-chapter ref, 0 if none."""
    b, c, vs, ve = ref
    pb, pc, pvs, pve = passage
    if (b, c) != (pb, pc):
        return 0
    if vs is None:
        return 0.5
    return max(0, min(ve or vs, pve) - max(vs, pvs) + 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="print the plan; write nothing")
    ap.add_argument("--title", help="plan title (default: the one in memory_care_30.json)")
    ap.add_argument("--description", help="plan description")
    ap.add_argument("--days", type=int, help="use only the first N passages")
    ap.add_argument("--publish", action="store_true",
                    help="use only published hymns, and publish the studies and the plan")
    args = ap.parse_args()

    cfg = json.loads((HERE / "memory_care_30.json").read_text(encoding="utf-8"))
    title = args.title or cfg["plan"]["title"]
    description = args.description or (cfg["plan"]["description"] if not args.title else None)
    passages = cfg["passages"][:args.days] if args.days else cfg["passages"]
    d = data.Data(*data.load_config())

    if any(p["title"] == title for p in d.plans()):
        sys.exit(f"A plan called “{title}” already exists. Edit it in the admin app "
                 "(or rename/archive it first if you really want a fresh seed).")

    # --- candidate hymns -----------------------------------------------------------
    topics_by_hymn = {}
    for r in d._all("hymn_topics", "hymn_id,topics(name)"):
        topics_by_hymn.setdefault(r["hymn_id"], set()).add(r["topics"]["name"])
    candidates = []
    for h in d.hymns():
        t = topics_by_hymn.get(h["id"], set())
        if not (h["is_familiar"] and h["audio_path"]) or h["status"] == "archived":
            continue
        if args.publish and h["status"] != "published":
            continue  # a published plan may only use published hymns
        if t & set(cfg["exclude_topics"]) or set(cfg["exclude_if_all_topics"]) <= t:
            continue
        candidates.append(h)
    # Full hymns with verified timing first; single-stanza ones last.
    candidates.sort(key=lambda h: (not h["timing_verified"], (h["stanza_count"] or 0) < 2, h["number"]))
    refs = {h["id"]: d.hymn_refs(h["id"]) for h in candidates}

    prayers = {p["slug"]: p for p in d.prayers()}
    missing = [s for s in cfg["prayer_order"] if s not in prayers]
    if missing:
        sys.exit(f"Prayers not found (run pipeline/import_prayers.py): {', '.join(missing)}")
    if len(candidates) < len(passages):
        sys.exit(f"Only {len(candidates)} suitable hymns for {len(passages)} days.")

    # --- pair each day's passage with a hymn and a prayer ------------------------------
    for passage in passages:
        why = data.check_ref(*passage)
        if why or passage[3] - passage[2] + 1 > 6:
            sys.exit(f"Bad passage {passage}: {why or 'more than 6 verses'}")
    passages = [tuple(p) for p in passages]
    # Pass 1: give passages the hymns that cite them, best matches first across ALL days
    # (so a hymn isn't used up on an earlier day when it's a setting of a later passage).
    score = lambda h, p: max([overlap(r, p) for r in refs[h["id"]]], default=0)
    pairs = sorted(((score(h, p), i, h["number"], h) for i, p in enumerate(passages) for h in candidates
                    if score(h, p) > 0), key=lambda x: (-x[0], x[1], x[2]))
    hymn_for, used = {}, set()
    for _, i, _, h in pairs:
        if i not in hymn_for and h["id"] not in used:
            hymn_for[i] = h
            used.add(h["id"])
    matched_days = set(hymn_for)
    # Pass 2: the remaining days get the remaining hymns in order.
    free = [h for h in candidates if h["id"] not in used]
    for i in range(len(passages)):
        if i not in hymn_for:
            hymn_for[i] = free.pop(0)
    days = [(p, hymn_for[i], prayers[cfg["prayer_order"][i % len(cfg["prayer_order"])]], i in matched_days)
            for i, p in enumerate(passages)]

    for n, (passage, hymn, prayer, matched) in enumerate(days, 1):
        print(f"Day {n:2d}  {ref_label(*passage):24s} #{hymn['number']:<3} {hymn['title'][:36]:36s}"
              f" {'(hymn cites it)' if matched else '               '}  {prayer['title']}")
    if args.dry_run:
        print("\nDry run: nothing written.")
        return

    # --- write (audited) ------------------------------------------------------------
    status = "published" if args.publish else "draft"
    existing = {(s["hymn_id"], s["book"], s["chapter"], s["verse_start"], s["verse_end"], s["prayer_id"]): s
                for s in d.studies()}
    plan = d.create_plan(title, description)
    study_ids, reused = [], 0
    for passage, hymn, prayer, _ in days:
        b, c, vs, ve = passage
        same = existing.get((hymn["id"], b, c, vs, ve, prayer["id"]))
        if same:
            reused += 1
            if args.publish and same["status"] != "published":
                d.set_status("studies", same["id"], "published")
            study_ids.append(same["id"])
            continue
        s = d.create_study({"title": f"{hymn['title']} · {ref_label(b, c, vs, ve)}", "hymn_id": hymn["id"],
                            "book": b, "chapter": c, "verse_start": vs, "verse_end": ve,
                            "prayer_id": prayer["id"], "status": status})
        study_ids.append(s["id"])
    d.set_plan_days(plan["id"], study_ids)
    print(f"\nCreated plan “{title}”: {len(study_ids)} days ({reused} existing studies reused).")
    if args.publish:
        blockers = d.publish_plan(plan["id"])
        if blockers:
            sys.exit("Plan left as draft; publish these first:\n  " + "\n  ".join(blockers))
        print("Published the plan (every day's study, hymn, and prayer is published).")
    else:
        print("It's a draft: review it in the admin app.")


if __name__ == "__main__":
    main()
