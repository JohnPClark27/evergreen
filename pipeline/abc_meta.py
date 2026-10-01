"""
abc_meta.py - read hymn metadata from Open Hymnal ABC files.

Ported from v1 (scripts/build_hymn_db.py): the scripture and topic parsers are
unchanged; the SQLite code is gone. New: meter, a first-line fallback, and
Windows-1252 decoding (some Open Hymnal files aren't UTF-8).
"""
import re
from pathlib import Path

# ---------------------------------------------------------------------------
# Open Hymnal abbreviation -> USFM book code (covers every abbreviation used)
# ---------------------------------------------------------------------------
USFM = {
    "Gen": "GEN", "Ex": "EXO", "Lv": "LEV", "Num": "NUM", "Deut": "DEU",
    "Josh": "JOS", "1Sam": "1SA", "2Sam": "2SA", "1Kgs": "1KI", "2Kgs": "2KI",
    "1Chr": "1CH", "2Chr": "2CH", "Ezra": "EZR", "Neh": "NEH", "Job": "JOB",
    "Ps": "PSA", "Pr": "PRO", "Eccl": "ECC", "So": "SNG", "Is": "ISA",
    "Jer": "JER", "Lam": "LAM", "Ez": "EZK", "Dan": "DAN", "Hos": "HOS",
    "Joel": "JOL", "Amos": "AMO", "Jon": "JON", "Mic": "MIC", "Nah": "NAM",
    "Hab": "HAB", "Zeph": "ZEP", "Hag": "HAG", "Zech": "ZEC", "Mal": "MAL",
    "Mt": "MAT", "Mk": "MRK", "Lk": "LUK", "Jn": "JHN", "Acts": "ACT",
    "Rom": "ROM", "1Cor": "1CO", "2Cor": "2CO", "Gal": "GAL", "Eph": "EPH",
    "Phil": "PHP", "Col": "COL", "1Thess": "1TH", "2Thess": "2TH",
    "1Tim": "1TI", "2Tim": "2TI", "Titus": "TIT", "Phlm": "PHM", "Heb": "HEB",
    "Jas": "JAS", "1Pt": "1PE", "2Pt": "2PE", "1Jn": "1JN", "2Jn": "2JN",
    "3Jn": "3JN", "Jude": "JUD", "Rev": "REV",
}

# book (optional) + rest, e.g. "1Cor 15:42-58", "15:42-58", "Ps 148"
BOOK_RE = re.compile(r"^\s*(\d?[A-Za-z]+)\.?\s+(.*)$")
TOPIC_RE = re.compile(r"\{([^\[\}]+?)\s*(?:\[([^\]]*)\])?\s*\}")


def num(s):
    """'16a' -> 16; '' -> None"""
    m = re.match(r"\d+", s or "")
    return int(m.group()) if m else None


def parse_span(span):
    """
    Parse the part after the book name into (chapter, v_start, v_end) rows.
      '3:16'      -> [(3,16,16)]
      '2:4-9'     -> [(2,4,9)]
      '148'       -> [(148,None,None)]
      '4-5'       -> [(4,None,None),(5,None,None)]
      '1:1-2:5'   -> [(1,1,None),(2,1,5)]
    Returns [] if unparseable.
    """
    span = span.strip().rstrip("-").strip()
    if not span:
        return []
    if ":" not in span:
        # chapter or chapter range
        parts = span.split("-")
        c1, c2 = num(parts[0]), num(parts[-1])
        if c1 is None:
            return []
        c2 = c2 if c2 and c2 >= c1 else c1
        return [(c, None, None) for c in range(c1, c2 + 1)]

    ch, verses = span.split(":", 1)
    c1 = num(ch)
    if c1 is None:
        return []
    if "-" not in verses:
        v = num(verses)
        return [(c1, v, v)] if v else [(c1, None, None)]

    left, right = verses.split("-", 1)
    v1 = num(left)
    if ":" in right:  # cross-chapter range 1:1-2:5
        c2, v2 = right.split(":", 1)
        c2, v2 = num(c2), num(v2)
        rows = [(c1, v1, None)]
        if c2 and c2 > c1:
            rows += [(c, None, None) for c in range(c1 + 1, c2)]
            rows.append((c2, 1, v2))
        return rows
    return [(c1, v1, num(right) or v1)]


def parse_scripture(line):
    """'%OHSCRIP Jn 1:1-5, 1:14, Ps 23' -> (list of (book, ch, vs, ve), unparsed pieces)"""
    body = line[len("%OHSCRIP"):]
    body = body.replace("\\n", " ").replace("\t", " ")
    out, bad, last_book = [], [], None
    for piece in re.split(r"[,;]", body):
        piece = piece.strip()
        if not piece:
            continue
        m = BOOK_RE.match(piece)
        if m and not m.group(1).isdigit():
            abbr, rest = m.group(1), m.group(2)
            book = USFM.get(abbr)
            if not book:
                bad.append(piece)
                continue
            last_book = book
        else:
            rest = piece  # continuation: reuse previous book
            if not last_book:
                bad.append(piece)
                continue
        rows = parse_span(rest)
        if not rows:
            bad.append(piece)
        for ch, vs, ve in rows:
            out.append((last_book, ch, vs, ve))
    return out, bad


def parse_topics(line):
    """'%OHTOPICS {Grace}, {Brevity of Life [3,4]}' -> [(topic, '3,4'|None)]"""
    return [
        (t.strip(), (s or "").replace(" ", "") or None)
        for t, s in TOPIC_RE.findall(line)
    ]


def clean_lyrics(w_line):
    """Turn one ABC 'w:' line into readable text (drops syllable markers)."""
    w = re.sub(r"\\-", "-", w_line)     # escaped real hyphen
    w = re.sub(r"[_*~|]", " ", w)       # holds, skips, joins, bars
    w = re.sub(r"\s*-\s*", "", w)       # syllable joins: A-maz-ing -> Amazing
    return re.sub(r"\s+", " ", w).strip()


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

def read_text(path):
    """File text as str: UTF-8 if valid, else Windows-1252 (a few files use it)."""
    data = Path(path).read_bytes()
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def hymn_files(src):
    """Every hymn ABC under src, sorted (skips do-hymn's *-for-midi.abc copies).
    The sort order is what v1 used for hymn ids, so numbers carry over."""
    return sorted(p for p in Path(src).rglob("*.abc") if not p.stem.endswith("-for-midi"))


def parse_abc(path, src_root):
    """Metadata for one ABC file. Scripture/topic problems are returned, not raised."""
    path = Path(path)
    text = read_text(path)
    title = meter = None
    refs, bad_refs, topics, w_lines = [], [], [], []
    for raw in text.splitlines():
        line = raw.rstrip("\r\n")
        if line.startswith("T:") and title is None:
            title = line[2:].strip() or None
        elif line.startswith("%OHSCRIP"):
            r, bad = parse_scripture(line)
            refs += r
            bad_refs += bad
        elif line.startswith("%OHTOPICS"):
            topics += parse_topics(line)
        elif line.startswith("%OHMETRICAL") and meter is None:
            meter = line[len("%OHMETRICAL"):].strip() or None
        elif line.startswith("w:"):
            w_lines.append(line[2:])

    folder, stem = path.parent.name, path.stem
    tune = stem.split("-", 1)[1].replace("_", " ") if "-" in stem else None
    # Fallback first line (the timing builder's meter-aware first line is preferred).
    first = clean_lyrics(w_lines[0]) if w_lines else ""
    first = re.sub(r"^\d+\.\s*", "", first) or None

    # The same topic can be listed twice in one file; keep the first.
    seen, uniq_topics = set(), []
    for name, stanzas in topics:
        if name not in seen:
            seen.add(name)
            uniq_topics.append((name, stanzas))

    return {
        "source_file": path.relative_to(src_root).as_posix(),
        "path": path,
        "text": text,
        "title": title or folder.replace("_", " "),
        "tune": tune,
        "meter": meter,
        "first_line": first,
        "refs": sorted(set(refs), key=lambda r: (r[0], r[1], r[2] or 0, r[3] or 0)),
        "bad_refs": bad_refs,
        "topics": uniq_topics,
    }
