// lib.ts - the curate function's pure logic (no network), so it can be tested with plain Node:
//   node supabase/functions/curate/test.ts
//
// The AI only SELECTS from a catalog of published content (hymn ids, prayer ids, Scripture
// references). Everything it returns is checked against that catalog here; anything unknown
// is dropped, and if nothing valid remains the caller uses fallback(). Trivia answers must
// appear word for word in the verse text that was sent.

import { BOOKS } from "../youversion/lib.ts";
import { DEFAULT_GUIDANCE, examplesText, FIXED_RULES, MOOD_EXAMPLES, MOOD_LABELS, type MoodExample } from "./prompt.ts";

export const MODULE_TYPES = ["hymn", "scripture", "prayer"] as const;
export const GAME_TYPES = ["word-search", "crossword", "trivia"] as const;
export const NEW_REASON = "Trying something new";
const REF_RE = /^[1-3A-Z]{3}\.\d{1,3}\.\d{1,3}-\d{1,3}$/;

export type Catalog = { hymns: string[]; prayers: string[]; refs: string[] };
export type HistoryRow = { type: string; id_or_ref: string; thumbs?: "up" | "down" | null; opened?: number; finished?: number; played?: number };
export type Suggestion = { module_type: string; id_or_ref: string; reason: string };
export type Game = { type: string; difficulty: "easy" | "normal"; ref: string; reason: string };
export type CurateResult = { suggestions: Suggestion[]; game: Game | null; source: "ai" | "fallback" };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pick = <T>(list: T[], rnd = Math.random): T | undefined => list[Math.floor(rnd() * list.length)];

/** Keep only well-formed, de-duplicated catalog entries (hymn/prayer ids are digits). */
export function cleanCatalog(raw: unknown): Catalog {
  const c = (raw ?? {}) as Record<string, unknown>;
  const list = (v: unknown, re: RegExp, max: number) =>
    [...new Set((Array.isArray(v) ? v : []).map((x) => String(x)).filter((x) => re.test(x)))].slice(0, max);
  return { hymns: list(c.hymns, /^\d{1,6}$/, 400), prayers: list(c.prayers, /^\d{1,6}$/, 200), refs: list(c.refs, REF_RE, 400) };
}

/** Only items in BOTH catalogs: what the tablet asked about AND what is published right now. */
export function intersect(a: Catalog, b: Catalog): Catalog {
  const and = (x: string[], y: string[]) => { const s = new Set(y); return x.filter((v) => s.has(v)); };
  return { hymns: and(a.hymns, b.hymns), prayers: and(a.prayers, b.prayers), refs: and(a.refs, b.refs) };
}

/** History rows: known types, ids/refs that look right, small counts. Nothing else gets through. */
export function cleanHistory(raw: unknown): HistoryRow[] {
  const types = new Set<string>([...MODULE_TYPES, ...GAME_TYPES, "finish-line"]);
  return (Array.isArray(raw) ? raw : []).slice(0, 40).flatMap((r) => {
    const type = str(r?.type, 20);
    const id = str(r?.id_or_ref, 20);
    if (!types.has(type) || !(/^\d{1,6}$/.test(id) || REF_RE.test(id))) return [];
    const n = (v: unknown) => Math.max(0, Math.min(999, Math.floor(Number(v) || 0)));
    const thumbs = r?.thumbs === "up" || r?.thumbs === "down" ? r.thumbs : null;
    return [{ type, id_or_ref: id, thumbs, opened: n(r?.opened), finished: n(r?.finished), played: n(r?.played) }];
  });
}

/** What each module type may point at in the catalog. */
function allowed(type: string, id: string, cat: Catalog): boolean {
  if (type === "hymn") return cat.hymns.includes(id);
  if (type === "prayer") return cat.prayers.includes(id);
  if (type === "scripture" || (GAME_TYPES as readonly string[]).includes(type)) return cat.refs.includes(id);
  return false;
}

/** Items the tablet marked "Skip next time" are never suggested. */
const skippedSet = (history: HistoryRow[]) => new Set(history.filter((h) => h.thumbs === "down").map((h) => `${h.type}:${h.id_or_ref}`));

/**
 * Check the model's JSON against the catalog. Unknown types, ids or refs are dropped, as are
 * skipped items and duplicates. A slide game must stay on the slide's passage.
 */
export function validate(raw: unknown, cat: Catalog, history: HistoryRow[], context: string, currentRef: string | null): CurateResult | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const skipped = skippedSet(history);
  const seen = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const s of Array.isArray(o.suggestions) ? o.suggestions : []) {
    const type = str(s?.module_type, 20);
    const id = str(s?.id_or_ref, 20);
    const key = `${type}:${id}`;
    const okType = (MODULE_TYPES as readonly string[]).includes(type) || (GAME_TYPES as readonly string[]).includes(type);
    if (!okType || !allowed(type, id, cat) || skipped.has(key) || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ module_type: type, id_or_ref: id, reason: str(s?.reason, 160) || "Picked for you" });
    if (suggestions.length >= 3) break;
  }
  let game: Game | null = null;
  const g = o.game as Record<string, unknown> | undefined;
  if (g) {
    const type = str(g.type, 20);
    const ref = currentRef ?? str(g.ref, 20); // on a slide, the game is about THAT passage
    if ((GAME_TYPES as readonly string[]).includes(type) && (currentRef || cat.refs.includes(ref)) && !skipped.has(`${type}:${ref}`)) {
      game = { type, difficulty: g.difficulty === "normal" ? "normal" : "easy", ref, reason: str(g.reason, 160) || "Picked for you" };
    }
  }
  if (context === "my_day" && !suggestions.length) return null;
  if (context !== "my_day" && !game) return null;
  return { suggestions: context === "my_day" ? suggestions : [], game, source: "ai" };
}

/**
 * The deterministic fallback (and the cold start): random published items, never skipped ones.
 * my_day: one hymn, one passage, one prayer and one game ("one of each").
 */
export function fallback(cat: Catalog, history: HistoryRow[], context: string, currentRef: string | null, rnd = Math.random): CurateResult {
  const skipped = skippedSet(history);
  const ok = (type: string) => (id: string) => !skipped.has(`${type}:${id}`);
  const reason = NEW_REASON;
  const hymn = pick(cat.hymns.filter(ok("hymn")), rnd);
  const ref = pick(cat.refs.filter(ok("scripture")), rnd);
  const prayer = pick(cat.prayers.filter(ok("prayer")), rnd);
  const gameRef = currentRef ?? ref;
  const gameType = gameRef ? pick(GAME_TYPES.filter((t) => ok(t)(gameRef)), rnd) : undefined;
  const game: Game | null = gameRef && gameType ? { type: gameType, difficulty: "easy", ref: gameRef, reason } : null;
  const suggestions: Suggestion[] = [];
  if (context === "my_day") {
    if (hymn) suggestions.push({ module_type: "hymn", id_or_ref: hymn, reason });
    if (ref) suggestions.push({ module_type: "scripture", id_or_ref: ref, reason });
    if (prayer) suggestions.push({ module_type: "prayer", id_or_ref: prayer, reason });
    if (game) suggestions.push({ module_type: game.type, id_or_ref: game.ref, reason });
  }
  return { suggestions, game, source: "fallback" };
}

/** Pull the first JSON object out of a model reply (models sometimes wrap it in ``` fences). */
export function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** The curate prompt: lists of ids with titles, the history, and the strict JSON shape. */
export function curatePrompt(context: string, cat: Catalog, titles: { hymns: Record<string, string>; prayers: Record<string, string> },
  history: HistoryRow[], currentRef: string | null): { system: string; user: string } {
  const system = [
    "You pick activities for an older adult using a hymn and Bible tablet with a caregiver.",
    "You ONLY choose items from the lists given, by their exact id or reference key. Never invent ids, references, verses, prayers or theology.",
    "Use the history: prefer things like those marked thumbs up, avoid repeats of things already finished, never choose thumbs-down items.",
    "Each reason is one short, plain sentence for the caregiver about why it was chosen (e.g. 'Because you enjoyed Amazing Grace'). No Scripture quotes, no teaching.",
    "Reply with JSON only, no other text.",
  ].join(" ");
  const shape = context === "my_day"
    ? '{"suggestions":[{"module_type":"hymn|scripture|prayer|word-search|crossword|trivia","id_or_ref":"<id or ref key>","reason":"..."}],"game":null}  (1 or 2 suggestions; games and scripture use a ref key)'
    : `{"suggestions":[],"game":{"type":"word-search|crossword|trivia","difficulty":"easy|normal","ref":"${currentRef ?? "<ref key>"}","reason":"..."}}`;
  const user = [
    `Context: ${context}${currentRef ? ` (the current passage is ${currentRef}; the game must use it)` : ""}.`,
    `Hymns (id: title): ${cat.hymns.slice(0, 80).map((id) => `${id}: ${titles.hymns[id] ?? "hymn"}`).join("; ")}`,
    `Prayers (id: title): ${cat.prayers.slice(0, 40).map((id) => `${id}: ${titles.prayers[id] ?? "prayer"}`).join("; ")}`,
    `Scripture reference keys (BOOK.chapter.start-end): ${cat.refs.slice(0, 120).join(", ")}`,
    `History (type, id or ref, thumbs, opened/finished/played): ${history.length ? history.map((h) => `${h.type} ${h.id_or_ref} ${h.thumbs ?? "-"} ${h.opened}/${h.finished}/${h.played}`).join("; ") : "none"}`,
    `Reply exactly in this JSON shape: ${shape}`,
  ].join("\n");
  return { system, user };
}

// ---------------------------------------------------------------------------
// Trivia: questions about the verse text sent in the request, checked word for word.
// ---------------------------------------------------------------------------

export type Verse = { num: number; text: string };
export type Question = { q: string; answer: string; choices: string[]; verse: number };

/** Names for God: a question whose answer is one must not offer another as a wrong choice. */
const DIVINE = /^(the )?(lord|jehovah|god|lord god|lord jehovah|jehovah god|almighty|the almighty|most high|the most high|christ|jesus|jesus christ|holy spirit|spirit|father|the father|my god|our god)$/;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** Verses as sent: at most 12, numbers and plain text only. */
export function cleanVerses(raw: unknown): Verse[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 12).flatMap((v) => {
    const num = Number(v?.num);
    const text = str(v?.text, 1200);
    return Number.isInteger(num) && num > 0 && text ? [{ num, text }] : [];
  });
}

/**
 * Keep a question only if its answer appears word for word in its verse (or, if the verse
 * number is wrong, anywhere in the passage, then the verse is corrected), the answer is one of
 * 2–4 distinct choices, and nothing is too long. Everything else is dropped.
 */
export function validateQuestions(raw: unknown, verses: Verse[]): Question[] {
  const out: Question[] = [];
  const list = Array.isArray((raw as Record<string, unknown>)?.questions) ? (raw as { questions: unknown[] }).questions : [];
  for (const r of list.slice(0, 6) as Record<string, unknown>[]) {
    const q = str(r?.q, 160);
    const answer = str(r?.answer, 60);
    if (!q || !answer || norm(answer).length < 2) continue;
    const choices = [...new Set((Array.isArray(r?.choices) ? r.choices : []).map((c) => str(c, 60)).filter(Boolean))];
    if (!choices.some((c) => norm(c) === norm(answer))) choices.unshift(answer);
    // A wrong choice that is another name for God when the answer is one ("The Lord" for
    // "Jehovah") would be a second right answer: drop that choice.
    const distinct = [...new Map(choices.map((c) => [norm(c), c])).values()]
      .filter((c) => norm(c) === norm(answer) || !(DIVINE.test(norm(answer)) && DIVINE.test(norm(c)))).slice(0, 4);
    if (distinct.length < 2 || !distinct.some((c) => norm(c) === norm(answer))) continue;
    const inVerse = (v: Verse) => ` ${norm(v.text)} `.includes(` ${norm(answer)} `);
    const verse = verses.find((v) => v.num === Number(r?.verse) && inVerse(v)) ?? verses.find(inVerse);
    if (!verse) continue; // the answer isn't in the passage: drop it
    // A distractor that is ALSO in this verse would make two right answers: drop the question.
    if (distinct.some((c) => norm(c) !== norm(answer) && ` ${norm(verse.text)} `.includes(` ${norm(c)} `))) continue;
    out.push({ q, answer, choices: distinct, verse: verse.num });
    if (out.length >= 3) break;
  }
  return out;
}

export function triviaPrompt(reference: string, verses: Verse[]): { system: string; user: string } {
  return {
    system: [
      "You write gentle, factual 'what does the passage say' questions for older adults, from the passage text given ONLY.",
      "Each answer must be copied word for word from the passage (one to four words). No interpretation, no theology, no outside facts.",
      "Give 3 questions, each with the correct answer and 2 or 3 short wrong choices that do NOT appear in that verse.",
      "Wrong choices must be clearly wrong: never a synonym or another name for the right answer (e.g. not 'the Lord' when the answer is 'Jehovah').",
      "Reply with JSON only.",
    ].join(" "),
    user: `Passage: ${reference}\n${verses.map((v) => `${v.num} ${v.text}`).join("\n")}\n\n` +
      'Reply exactly: {"questions":[{"q":"...","answer":"<words from the verse>","choices":["...","...","..."],"verse":<verse number>}]}',
  };
}

// ---------------------------------------------------------------------------
// "Chosen for you": a verse of the day for a feeling, and four activities around it.
// ---------------------------------------------------------------------------


export const PICK_TYPES = ["hymn", "prayer", "read", ...GAME_TYPES] as const;
export type Pick = { module_type: string; id_or_ref: string; reason: string };
export type TodayResult = { verse: { ref: string; reason: string }; picks: Pick[]; source: "ai" | "fallback" };

/** A verse-of-the-day reference the model gave: a real book and chapter, 1–3 verses.
 * Accepts "PSA.23.1-3" or "PSA.23.1". Returns the normalised key, or null. */
export function checkVerseRef(raw: unknown): string | null {
  const m = /^([1-3A-Z]{3})\.(\d{1,3})\.(\d{1,3})(?:-(\d{1,3}))?$/.exec(str(raw, 20).toUpperCase());
  if (!m || !BOOKS[m[1]]) return null;
  const chapter = Number(m[2]), start = Number(m[3]), end = Number(m[4] ?? m[3]);
  if (chapter < 1 || chapter > BOOKS[m[1]][1] || start < 1 || end < start || end - start > 2) return null;
  return `${m[1]}.${chapter}.${start}-${end}`;
}

/** Drop the model's step-by-step reasoning; only the JSON after it is used. */
export const stripThinking = (text: string) => text.replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, "");

/** A random example passage for a feeling (the fallback verse). */
export function exampleVerse(level: number, rnd = Math.random, examples: MoodExample[] = MOOD_EXAMPLES): string {
  const refs = examples.find((e) => e.level === level)?.refs ?? MOOD_EXAMPLES[2].refs;
  return pick(refs, rnd)!;
}

/** Keep picks that are known, published, distinct and not skipped; games and "read" must be
 * about the verse of the day or a catalog passage. At most 4. */
export function validatePicks(raw: unknown, cat: Catalog, history: HistoryRow[], verseRef: string): Pick[] {
  const skipped = skippedSet(history);
  const seen = new Set<string>();
  const out: Pick[] = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    const type = str(p?.module_type, 20);
    let id = str(p?.id_or_ref, 20);
    if (!(PICK_TYPES as readonly string[]).includes(type)) continue;
    if (type === "hymn" ? !cat.hymns.includes(id) : type === "prayer" ? !cat.prayers.includes(id)
      : !(id === verseRef || cat.refs.includes(id) || (id = checkVerseRef(id) ?? "") === verseRef)) continue;
    const key = `${type}:${id}`;
    if (seen.has(key) || skipped.has(key)) continue;
    seen.add(key);
    out.push({ module_type: type, id_or_ref: id, reason: str(p?.reason, 160) });
    if (out.length >= 4) break;
  }
  return out;
}

/** Fill up to 4 picks with a varied random mix around the verse: hymn, game, prayer, read. */
export function fillPicks(picks: Pick[], cat: Catalog, history: HistoryRow[], verseRef: string, rnd = Math.random): Pick[] {
  const skipped = skippedSet(history);
  const out = [...picks];
  const has = (type: string, id: string) => out.some((p) => p.module_type === type && p.id_or_ref === id);
  const add = (type: string, id: string | undefined) => {
    if (out.length < 4 && id && !has(type, id) && !skipped.has(`${type}:${id}`)) out.push({ module_type: type, id_or_ref: id, reason: NEW_REASON });
  };
  const kinds = (t: string) => out.filter((p) => (t === "game" ? (GAME_TYPES as readonly string[]).includes(p.module_type) : p.module_type === t)).length;
  if (!kinds("hymn")) add("hymn", pick(cat.hymns, rnd));
  if (!kinds("game")) add(pick([...GAME_TYPES], rnd)!, verseRef);
  if (!kinds("prayer")) add("prayer", pick(cat.prayers, rnd));
  if (!kinds("read")) add("read", verseRef);
  for (let i = 0; out.length < 4 && i < 20; i++) add("hymn", pick(cat.hymns, rnd));
  return out;
}

/** The editable prompt (from the ai_prompts table), checked: guidance text and examples with
 * valid references only; anything missing or malformed falls back to the defaults. */
export function cleanPrompt(row: unknown): { guidance: string; examples: MoodExample[] } {
  const r = (row ?? {}) as Record<string, unknown>;
  const guidance = str(r.guidance, 4000) || DEFAULT_GUIDANCE;
  const examples = (Array.isArray(r.examples) ? r.examples : []).flatMap((e) => {
    const level = Number(e?.level);
    if (!MOOD_LABELS[level]) return [];
    const themes = (Array.isArray(e?.themes) ? e.themes : []).map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 6);
    const refs = (Array.isArray(e?.refs) ? e.refs : []).map((x: unknown) => checkVerseRef(x)).filter(Boolean).slice(0, 8) as string[];
    return refs.length ? [{ level, label: MOOD_LABELS[level], themes, refs }] : [];
  });
  return { guidance, examples: examples.length === 5 ? examples.sort((a, b) => a.level - b.level) : MOOD_EXAMPLES };
}

export function todayPrompt(level: number, cat: Catalog, titles: { hymns: Record<string, string>; prayers: Record<string, string> },
  history: HistoryRow[], prompt = cleanPrompt(null)): { system: string; user: string } {
  const user = [
    `They said they are feeling: "${MOOD_LABELS[level] ?? "Okay"}" (${level} on a scale where 1 is wonderful and 5 is having a hard day).`,
    `Example passages by feeling (a guide, not a limit):\n${examplesText(prompt.examples)}`,
    `Hymns (id: title): ${cat.hymns.slice(0, 80).map((id) => `${id}: ${titles.hymns[id] ?? "hymn"}`).join("; ")}`,
    `Prayers (id: title): ${cat.prayers.slice(0, 40).map((id) => `${id}: ${titles.prayers[id] ?? "prayer"}`).join("; ")}`,
    `Activity kinds: hymn (a hymn id), prayer (a prayer id), read (read the verse's chapter; use the verse ref), word-search / crossword / trivia (a game on the verse; use the verse ref).`,
    `What they enjoyed before (type, id, thumbs): ${history.length ? history.map((h) => `${h.type} ${h.id_or_ref} ${h.thumbs ?? "-"}`).join("; ") : "nothing yet"}. Never choose thumbs-down items.`,
    `After your <thinking>, reply exactly: {"verse":{"ref":"BOOK.chapter.start-end","reason":"one short plain sentence for the caregiver, no quotes from Scripture"},"picks":[{"module_type":"...","id_or_ref":"...","reason":"..."}]}  (exactly 4 picks)`,
  ].join("\n\n");
  // The admin's guidance first, then the fixed rules (always last, so they win).
  return { system: `${prompt.guidance}\n\n${FIXED_RULES}`, user };
}
