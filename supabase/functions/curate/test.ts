// Tests for lib.ts (no network):  node supabase/functions/curate/test.ts
import { cleanCatalog, cleanHistory, fallback, parseJson, validate, validateQuestions } from "./lib.ts";

let pass = 0, fail = 0;
const ok = (cond: unknown, msg: string) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

const cat = cleanCatalog({ hymns: ["1", "2", "x"], prayers: ["5"], refs: ["PSA.23.1-4", "JHN.3.16-17", "bad"] });
ok(cat.hymns.length === 2 && cat.refs.length === 2, "catalog drops malformed ids/refs");

const history = cleanHistory([{ type: "hymn", id_or_ref: "2", thumbs: "down" }, { type: "evil", id_or_ref: "1" }, { type: "hymn", id_or_ref: "Robert" }]);
ok(history.length === 1, "history keeps only known types and ids (no names)");

const v = validate({ suggestions: [
  { module_type: "hymn", id_or_ref: "1", reason: "Because you enjoyed it" },
  { module_type: "hymn", id_or_ref: "2", reason: "skipped" },      // thumbs down: dropped
  { module_type: "hymn", id_or_ref: "999", reason: "made up" },     // not published: dropped
  { module_type: "scripture", id_or_ref: "GEN.1.1-99", reason: "x" }, // not in catalog: dropped
  { module_type: "sermon", id_or_ref: "1", reason: "x" },           // unknown type: dropped
] }, cat, history, "my_day", null);
ok(v?.suggestions.length === 1 && v.suggestions[0].id_or_ref === "1", "validate drops unknown, skipped and invented items");
ok(validate({ suggestions: [{ module_type: "hymn", id_or_ref: "999" }] }, cat, history, "my_day", null) === null, "nothing valid -> null (fallback)");
const g = validate({ game: { type: "trivia", difficulty: "normal", ref: "GEN.50.1-2", reason: "r" } }, cat, [], "slide_game", "PSA.23.1-4");
ok(g?.game?.ref === "PSA.23.1-4", "slide game stays on the slide's passage");

const fb = fallback(cat, history, "my_day", null);
ok(fb.suggestions.map((s) => s.module_type).join() .includes("hymn") && fb.suggestions.length === 4, "cold start: one of each + a game");
ok(fb.suggestions.every((s) => s.reason === "Trying something new"), "cold start reason");
ok(!fb.suggestions.some((s) => s.module_type === "hymn" && s.id_or_ref === "2"), "fallback never suggests a skipped item");

ok((parseJson("```json\n{\"a\":1}\n```") as { a: number }).a === 1, "parseJson strips fences");

const verses = [{ num: 1, text: "The LORD is my shepherd; I shall not want." }, { num: 2, text: "He maketh me to lie down in green pastures." }];
const qs = validateQuestions({ questions: [
  { q: "Who is my shepherd?", answer: "The LORD", choices: ["The LORD", "A king", "My friend"], verse: 1 },
  { q: "Where does he make me lie down?", answer: "green pastures", choices: ["green pastures", "a quiet room"], verse: 2 },
  { q: "What color is the sky?", answer: "blue", choices: ["blue", "red"], verse: 1 },          // fabricated: dropped
  { q: "Trick", answer: "shepherd", choices: ["shepherd", "want"], verse: 1 },                  // two right answers: dropped
] }, verses);
ok(qs.length === 2, `trivia keeps only answers found word for word (${qs.length})`);
ok(qs[1].verse === 2, "trivia keeps the verse number");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;

// ---------- Chosen for you ----------
import { checkVerseRef, fillPicks, stripThinking, validatePicks } from "./lib.ts";
let p2 = 0, f2 = 0;
const ok2 = (c: unknown, m: string) => { if (c) p2++; else { f2++; console.log("FAIL", m); } };
ok2(checkVerseRef("psa.23.1-3") === "PSA.23.1-3", "verse ref normalised");
ok2(checkVerseRef("PSA.23.4") === "PSA.23.4-4", "single verse ok");
ok2(checkVerseRef("PSA.151.1") === null, "no Psalm 151");
ok2(checkVerseRef("PSA.23.1-6") === null, "at most 3 verses");
ok2(checkVerseRef("XYZ.1.1") === null, "unknown book");
ok2(stripThinking('<thinking>{"bad":1} feeling...</thinking>\n{"verse":{}}').trim() === '{"verse":{}}', "reasoning dropped before parsing");
const cat2 = cleanCatalog({ hymns: ["1", "2", "3"], prayers: ["5", "6"], refs: ["PSA.23.1-4"] });
const picks = validatePicks([
  { module_type: "hymn", id_or_ref: "1" }, { module_type: "hymn", id_or_ref: "2" },   // two different hymns: fine
  { module_type: "hymn", id_or_ref: "1" },                                            // duplicate: dropped
  { module_type: "trivia", id_or_ref: "PSA.46.1-1" },                                 // the verse of the day: ok
  { module_type: "crossword", id_or_ref: "GEN.1.1-3" },                               // unrelated passage: dropped
  { module_type: "sermon", id_or_ref: "1" },                                          // unknown kind: dropped
  { module_type: "prayer", id_or_ref: "99" },                                         // unpublished: dropped
], cat2, [], "PSA.46.1-1");
ok2(picks.length === 3 && picks.filter((p) => p.module_type === "hymn").length === 2, `picks validated (${JSON.stringify(picks.map((p) => p.module_type))})`);
const full = fillPicks(picks, cat2, [], "PSA.46.1-1");
ok2(full.length === 4 && new Set(full.map((p) => `${p.module_type}:${p.id_or_ref}`)).size === 4, "filled to 4 distinct picks");
console.log(`today: ${p2} passed, ${f2} failed`);
if (f2) process.exitCode = 1;
