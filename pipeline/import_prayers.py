"""
import_prayers.py - the 15 starter prayers, verbatim from the Open Prayer Book.

Clones https://github.com/freebcp/open-prayer-book into vendor/ (gitignored), finds each
prayer by its opening words in the 1662 or 1979 Markdown, and imports it as 'published'.
If ANY prayer isn't found, it stops and reports. Prayer text is never typed in by hand.

Text cleanup is formatting only, never wording:
  - Markdown marks (**bold**, *italic*, #### headings, \\[ escapes) are removed
  - the printed drop-cap ("**OUR** Father", "**O LORD**,") becomes "Our Father", "O Lord,"
  - a prayer that spans paragraphs (Glory Be) is joined with line breaks, up to its "Amen."
  - OPTIONAL_CLAUSES: a [bracketed] clause the book itself marks as optional is left out

Usage (from the repo root):
  python pipeline/import_prayers.py --dry-run     # show the extracted text, write nothing
  python pipeline/import_prayers.py               # insert missing prayers
  python pipeline/import_prayers.py --update      # also overwrite text/source of existing ones
"""
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO_URL = "https://github.com/freebcp/open-prayer-book"
VENDOR = ROOT / "vendor" / "open-prayer-book"
LICENSE_COPY = ROOT / "docs" / "licenses" / "open-prayer-book-LICENSE.txt"

# slug, title, book, opening words  (from docs/PLAN_PROMPT.md, Phase 2)
PRAYERS = [
    ("lords-prayer", "The Lord's Prayer", 1662, "Our Father, which art in heaven"),
    ("gloria-patri", "Glory Be", 1662, "Glory be to the Father"),
    ("the-grace", "The Grace", 1662, "The grace of our Lord Jesus Christ"),
    ("collect-for-peace-morning", "Collect for Peace", 1662, "O God, who art the author of peace"),
    ("collect-for-grace", "Collect for Grace", 1662,
     "O Lord, our heavenly Father, Almighty and everlasting God, who hast safely brought us"),
    ("collect-for-peace-evening", "Evening Collect for Peace", 1662, "O God, from whom all holy desires"),
    ("lighten-our-darkness", "Collect for Aid against All Perils", 1662, "Lighten our darkness, we beseech thee, O Lord"),
    ("general-thanksgiving", "The General Thanksgiving", 1662, "Almighty God, Father of all mercies"),
    ("st-chrysostom", "A Prayer of St. Chrysostom", 1662, "Almighty God, who hast given us grace at this time"),
    ("collect-for-purity", "Collect for Purity", 1662, "Almighty God, unto whom all hearts be open"),
    ("keep-watch", "Keep Watch, Dear Lord", 1979, "Keep watch, dear Lord, with those who work, or watch, or weep"),
    ("be-present", "Be Present, O Merciful God", 1979, "Be present, O merciful God, and protect us"),
    ("support-us-all-the-day", "Support Us All the Day Long", 1979, "O Lord, support us all the day long"),
    ("st-francis", "A Prayer Attributed to St. Francis", 1979, "Lord, make us instruments of your peace"),
    ("quiet-confidence", "For Quiet Confidence", 1979, "O God of peace, who hast taught us that in returning and rest"),
]

# Bracketed clauses the book marks as optional, left out for daily use with residents.
# 1662 General Thanksgiving: "[*particularly to those who desire now to offer up their
# praises ...]" with the rubric "This to be said when any that have been prayed for
# desire to return praise." Omitting it follows that rubric; no words are changed.
OPTIONAL_CLAUSES = {"general-thanksgiving": "particularly to those who desire now to offer up their praises"}

ATTRIBUTION = {1662: "The Book of Common Prayer (1662)", 1979: "The Book of Common Prayer (1979)"}
# Heading level that names a service in each file (1662: "## The Order for Morning Prayer",
# 1979: "### Daily Evening Prayer: Rite One"); deeper headings are rubrics or sub-parts.
SECTION_LEVEL = {1662: 2, 1979: 3}


# ---------------------------------------------------------------------------
# Markdown -> plain text
# ---------------------------------------------------------------------------

def drop_cap(m):
    """'OUR' -> 'Our', 'O LORD' -> 'O Lord' (the printed book's capitalised first word)."""
    return " ".join(w if len(w) == 1 else w[0] + w[1:].lower() for w in m.group(1).split())


def plain(lines):
    """Clean text of one Markdown paragraph (a list of raw lines)."""
    out = []
    for i, raw in enumerate(lines):
        hard_break = raw.endswith("  ")                  # Markdown line break inside a paragraph
        s = re.sub(r"<a [^>]*></a>|<!--.*?-->", "", raw)  # anchors, page markers
        s = re.sub(r"^#+\s*", "", s)                      # heading marks
        s = re.sub(r"^\*\*([A-Z][A-Z’' ]*?)\*\*", drop_cap, s.strip())
        s = s.replace("**", "").replace("*", "")
        s = re.sub(r"\\(.)", r"\1", s)                     # \[ -> [
        s = re.sub(r"\s+", " ", s).strip()
        if s:
            out.append(s + ("\n" if hard_break and i < len(lines) - 1 else " "))
    return "".join(out).strip()


def norm(s):
    """For matching only: lowercase letters/digits/spaces."""
    s = s.replace("’", "'").casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s)).strip()


def paragraphs(md_text):
    """[(first line number, [raw lines])] split on blank lines."""
    paras, cur, start = [], [], 0
    for n, line in enumerate(md_text.splitlines(), 1):
        if line.strip():
            if not cur:
                start = n
            cur.append(line)
        elif cur:
            paras.append((start, cur))
            cur = []
    if cur:
        paras.append((start, cur))
    return paras


def find_prayer(paras, opening, section_level):
    """(text, line number, section) for the first paragraph starting with `opening`,
    extended until a paragraph ends with 'Amen'. None if not found.
    section = the nearest heading at `section_level` or above (the service it's in)."""
    want = norm(opening)
    heading = None
    for i, (line_no, lines) in enumerate(paras):
        level = len(lines[0]) - len(lines[0].lstrip("#"))
        is_heading = 0 < level <= section_level
        text = plain(lines)
        if norm(text).startswith(want):
            parts = []
            for _, more in paras[i:i + 4]:          # a prayer never spans more than a few paragraphs
                parts.append(plain(more))
                if norm(parts[-1]).endswith("amen"):
                    return "\n".join(parts), line_no, heading
            return None                              # started but no "Amen." nearby: don't guess
        if is_heading:
            heading = text.rstrip(".").strip() or heading
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def ensure_repo():
    if not (VENDOR / ".git").exists():
        print(f"Cloning {REPO_URL} -> {VENDOR.relative_to(ROOT)}")
        VENDOR.parent.mkdir(exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", REPO_URL, str(VENDOR)], check=True)
    commit = subprocess.run(["git", "-C", str(VENDOR), "rev-parse", "--short", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    LICENSE_COPY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(VENDOR / "LICENSE", LICENSE_COPY)
    return commit


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="print the extracted prayers; write nothing")
    ap.add_argument("--update", action="store_true", help="overwrite text/source of prayers already in the DB")
    args = ap.parse_args()

    commit = ensure_repo()
    books = {b: paragraphs((VENDOR / "md" / f"bcp{b}.md").read_text(encoding="utf-8")) for b in (1662, 1979)}

    rows, missing = [], []
    for slug, title, book, opening in PRAYERS:
        found = find_prayer(books[book], opening, SECTION_LEVEL[book])
        if not found:
            missing.append(f"{slug} ({book}): \"{opening}\"")
            continue
        text, line_no, section = found
        if slug in OPTIONAL_CLAUSES:
            clause = re.search(r" ?\[" + re.escape(OPTIONAL_CLAUSES[slug]) + r"[^\]]*\]", text)
            if not clause:
                missing.append(f"{slug}: optional clause not found where expected")
                continue
            text = text[:clause.start()] + text[clause.end():]
        rows.append({
            "slug": slug, "title": title, "text": text, "section": section,
            "attribution": ATTRIBUTION[book],
            "source": f"Open Prayer Book ({REPO_URL} @ {commit}), md/bcp{book}.md line {line_no}"
                      + (" (optional bracketed clause omitted, per the book's rubric)" if slug in OPTIONAL_CLAUSES else ""),
        })

    if missing:
        print("STOPPED: these prayers were not found verbatim, so nothing was imported:")
        print("\n".join(f"  {m}" for m in missing))
        sys.exit(1)

    for r in rows:
        print(f"--- {r['slug']}  [{r['attribution']}; {r['section']}]\n{r['text']}\n    source: {r['source']}\n")
    print(f"All {len(rows)} prayers found. License copied to {LICENSE_COPY.relative_to(ROOT)}")
    if args.dry_run:
        return

    import supa  # needs the venv (supabase, python-dotenv); not needed for --dry-run
    sb = supa.client()
    existing = {p["slug"]: p for p in supa.select_all(sb, "prayers", "id,slug,text,source")}
    new = [{**r, "status": "published"} for r in rows if r["slug"] not in existing]
    changed = [r for r in rows if r["slug"] in existing
               and (existing[r["slug"]]["text"], existing[r["slug"]]["source"]) != (r["text"], r["source"])]
    if new:
        sb.table("prayers").insert(new).execute()
    if args.update:
        for r in changed:
            sb.table("prayers").update(r).eq("slug", r["slug"]).execute()
    print(f"Inserted {len(new)}; {len(changed)} differ from the DB"
          f"{' and were updated' if args.update else ' (left alone; use --update)'}; "
          f"{len(rows) - len(new) - len(changed)} unchanged.")
    sb.table("audit_log").insert({
        "actor": supa.actor("pipeline"), "action": "import", "table_name": "prayers",
        "after": {"inserted": [r["slug"] for r in new],
                  "updated": [r["slug"] for r in changed] if args.update else [], "commit": commit},
    }).execute()


if __name__ == "__main__":
    main()
