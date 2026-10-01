"""
seed_memory_care_plan.py - build the starter "Memory Care — 30 Days" plan as a DRAFT.

Each day = one familiar hymn + one short comforting passage (from memory_care_30.json,
references only) + one of the 15 prayers (rotating, never the same two days running).
Hymns: familiar, with audio, not seasonal (Christmas/Easter-only), never repeated.
A hymn whose own scripture refs cover most of the day's passage is preferred.

All writes go through admin/data.py, so every insert is in the Audit Log.
Studies and the plan are created as 'draft' for review in the admin app.

Usage (repo root, venv active):
  python supabase/seed/seed_memory_care_plan.py --dry-run
  python supabase/seed/seed_memory_care_plan.py
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
    args = ap.parse_args()

    cfg = json.loads((HERE / "memory_care_30.json").read_text(encoding="utf-8"))
    d = data.Data(*data.load_config())

    if any(p["title"] == cfg["plan"]["title"] for p in d.plans()):
        sys.exit(f"A plan called “{cfg['plan']['title']}” already exists. Edit it in the admin app "
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
    if len(candidates) < len(cfg["passages"]):
        sys.exit(f"Only {len(candidates)} suitable familiar hymns for {len(cfg['passages'])} days.")

    # --- pair each day's passage with a hymn and a prayer ------------------------------
    used, days = set(), []
    for i, passage in enumerate(cfg["passages"]):
        passage = tuple(passage)
        why = data.check_ref(*passage)
        if why or passage[3] - passage[2] + 1 > 6:
            sys.exit(f"Bad passage {passage}: {why or 'more than 6 verses'}")
        free = [h for h in candidates if h["id"] not in used]
        # Prefer the hymn whose own refs cover the most of this passage.
        score = {h["id"]: max([overlap(r, passage) for r in refs[h["id"]]], default=0) for h in free}
        matched = sorted((h for h in free if score[h["id"]] > 0), key=lambda h: -score[h["id"]])
        hymn = (matched or free)[0]
        used.add(hymn["id"])
        prayer = prayers[cfg["prayer_order"][i % len(cfg["prayer_order"])]]
        days.append((passage, hymn, prayer, bool(matched)))

    for n, (passage, hymn, prayer, matched) in enumerate(days, 1):
        print(f"Day {n:2d}  {ref_label(*passage):24s} #{hymn['number']:<3} {hymn['title'][:36]:36s}"
              f" {'(hymn cites it)' if matched else '               '}  {prayer['title']}")
    if args.dry_run:
        print("\nDry run: nothing written.")
        return

    # --- write (audited) ------------------------------------------------------------
    plan = d.create_plan(cfg["plan"]["title"], cfg["plan"]["description"])
    study_ids = []
    for passage, hymn, prayer, _ in days:
        b, c, vs, ve = passage
        s = d.create_study({"title": f"{hymn['title']} · {ref_label(b, c, vs, ve)}", "hymn_id": hymn["id"],
                            "book": b, "chapter": c, "verse_start": vs, "verse_end": ve,
                            "prayer_id": prayer["id"], "status": "draft"})
        study_ids.append(s["id"])
    d.set_plan_days(plan["id"], study_ids)
    print(f"\nCreated draft plan “{plan['title']}” with {len(study_ids)} draft studies. Review it in the admin app.")


if __name__ == "__main__":
    main()
