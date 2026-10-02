// lib.ts - pure helpers for the youversion Edge Function (no Deno APIs, so they can be
// tested locally with Node: `node supabase/functions/youversion/test.ts`).

// USFM code -> [English name, chapter count]. Keep in sync with admin/books.py.
export const BOOKS: Record<string, [string, number]> = {
  GEN: ["Genesis", 50], EXO: ["Exodus", 40], LEV: ["Leviticus", 27], NUM: ["Numbers", 36],
  DEU: ["Deuteronomy", 34], JOS: ["Joshua", 24], JDG: ["Judges", 21], RUT: ["Ruth", 4],
  "1SA": ["1 Samuel", 31], "2SA": ["2 Samuel", 24], "1KI": ["1 Kings", 22], "2KI": ["2 Kings", 25],
  "1CH": ["1 Chronicles", 29], "2CH": ["2 Chronicles", 36], EZR: ["Ezra", 10], NEH: ["Nehemiah", 13],
  EST: ["Esther", 10], JOB: ["Job", 42], PSA: ["Psalms", 150], PRO: ["Proverbs", 31],
  ECC: ["Ecclesiastes", 12], SNG: ["Song of Songs", 8], ISA: ["Isaiah", 66], JER: ["Jeremiah", 52],
  LAM: ["Lamentations", 5], EZK: ["Ezekiel", 48], DAN: ["Daniel", 12], HOS: ["Hosea", 14],
  JOL: ["Joel", 3], AMO: ["Amos", 9], OBA: ["Obadiah", 1], JON: ["Jonah", 4], MIC: ["Micah", 7],
  NAM: ["Nahum", 3], HAB: ["Habakkuk", 3], ZEP: ["Zephaniah", 3], HAG: ["Haggai", 2],
  ZEC: ["Zechariah", 14], MAL: ["Malachi", 4], MAT: ["Matthew", 28], MRK: ["Mark", 16],
  LUK: ["Luke", 24], JHN: ["John", 21], ACT: ["Acts", 28], ROM: ["Romans", 16],
  "1CO": ["1 Corinthians", 16], "2CO": ["2 Corinthians", 13], GAL: ["Galatians", 6],
  EPH: ["Ephesians", 6], PHP: ["Philippians", 4], COL: ["Colossians", 4],
  "1TH": ["1 Thessalonians", 5], "2TH": ["2 Thessalonians", 3], "1TI": ["1 Timothy", 6],
  "2TI": ["2 Timothy", 4], TIT: ["Titus", 3], PHM: ["Philemon", 1], HEB: ["Hebrews", 13],
  JAS: ["James", 5], "1PE": ["1 Peter", 5], "2PE": ["2 Peter", 3], "1JN": ["1 John", 5],
  "2JN": ["2 John", 1], "3JN": ["3 John", 1], JUD: ["Jude", 1], REV: ["Revelation", 22],
};

export const MAX_VERSES = 50; // one request never needs more than this

export type Ref = { book: string; chapter: number; start: number | null; end: number | null };

/** Validate query params. Returns a Ref, or an error message for a 400. */
export function parseRef(params: URLSearchParams): Ref | string {
  const book = (params.get("book") ?? "").trim().toUpperCase();
  if (!book) return "Missing 'book' (a USFM code like PSA or JHN).";
  if (!BOOKS[book]) return `Unknown book '${book}'. Use a USFM code like PSA, JHN, or 1CO.`;
  const [name, chapters] = BOOKS[book];

  const int = (key: string): number | null | string => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") return null;
    if (!/^\d{1,3}$/.test(raw.trim())) return `'${key}' must be a whole number.`;
    return Number(raw);
  };
  const chapter = int("chapter");
  if (typeof chapter === "string") return chapter;
  if (chapter === null) return "Missing 'chapter'.";
  if (chapter < 1 || chapter > chapters) return `${name} has chapters 1-${chapters}, not ${chapter}.`;

  const start = int("start");
  if (typeof start === "string") return start;
  let end = int("end");
  if (typeof end === "string") return end;
  if (start === null && end !== null) return "'end' needs a 'start'.";
  if (start !== null) {
    if (start < 1) return "Verses start at 1.";
    end ??= start;
    if (end < start) return "'end' is before 'start'.";
    if (end - start + 1 > MAX_VERSES) return `Ask for at most ${MAX_VERSES} verses at a time.`;
  }
  return { book, chapter, start, end };
}

export function label(ref: Ref): string {
  // A single psalm is "Psalm 23", not "Psalms 23" (the book itself is still "Psalms").
  const name = ref.book === "PSA" ? "Psalm" : BOOKS[ref.book][0];
  if (ref.start === null) return `${name} ${ref.chapter}`;
  return `${name} ${ref.chapter}:${ref.start}${ref.end !== ref.start ? `-${ref.end}` : ""}`;
}

const ENTITIES: Record<string, string> = { quot: '"', "#39": "'", apos: "'", lt: "<", gt: ">", nbsp: " ", amp: "&" };

/** YouVersion passage HTML -> [{num, text}] (ported from v1 server/youversion.js).
 * Each verse starts with <span class="yv-v" v="N"></span>, then a label <span class="yv-vlbl">N</span>. */
export function parseVerses(html: string): { num: number; text: string }[] {
  const parts = html.split(/<span class="yv-v" v="(\d+)"><\/span>/);
  const verses = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1]
      .replace(/<span class="yv-vlbl">.*?<\/span>/g, "") // drop the verse-number label
      .replace(/<\/?div[^>]*>/g, " ")                     // paragraph breaks become spaces
      .replace(/<[^>]+>/g, "")                            // strip remaining inline tags
      .replace(/&(quot|#39|apos|lt|gt|nbsp|amp);/g, (_, e) => ENTITIES[e])
      .replace(/\s+/g, " ")
      .trim();
    verses.push({ num: Number(parts[i]), text });
  }
  return verses;
}

// ---------------------------------------------------------------------------
// CORS: the Pages site (production + preview subdomains) and localhost only.

export function allowedOrigin(origin: string | null, pagesHosts: string[]): boolean {
  if (!origin) return false;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  if (url.protocol !== "https:") return false;
  // e.g. hymnal-reader-v2.pages.dev and <branch-or-hash>.hymnal-reader-v2.pages.dev
  return pagesHosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

// ---------------------------------------------------------------------------
// Rate limiting keys. Counters live in Postgres (see migration ..._rate_limits.sql)
// because hosted Edge Functions don't keep memory between requests. Keys are
// SHA-256(secret + ":" + client), so raw IPs are never stored and nobody without
// the secret can compute (and exhaust) another client's key.

export async function limitKey(secret: string, client: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${client}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

// ---------------------------------------------------------------------------
// TTL cache (in memory). YouVersion's docs recommend caching responses "when possible";
// TTLs are configurable and 0 turns caching off. Hosted instances are short-lived, so
// this only helps when an instance is reused: browsers also cache the response
// (Cache-Control), and the public app keeps passages in memory for the session.

export class TtlCache<T> {
  private items = new Map<string, { until: number; value: T }>();
  private ttlSeconds: number;
  private maxItems: number;
  constructor(ttlSeconds: number, maxItems = 500) {
    this.ttlSeconds = ttlSeconds;
    this.maxItems = maxItems;
  }

  get(key: string, now = Date.now()): T | undefined {
    const hit = this.items.get(key);
    if (!hit) return undefined;
    if (hit.until <= now) { this.items.delete(key); return undefined; }
    return hit.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.ttlSeconds <= 0) return;
    if (this.items.size >= this.maxItems) this.items.delete(this.items.keys().next().value as string);
    this.items.set(key, { until: now + this.ttlSeconds * 1000, value });
  }
}
