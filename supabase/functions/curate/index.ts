// curate - AI curation for Hymnal Reader. The AI only SELECTS published content and writes
// trivia questions from verse text sent with the request; it never writes Scripture, prayers
// or theology. Every answer is validated (lib.ts); on any problem the caller gets the
// deterministic fallback, so the tablet never waits on or breaks because of the AI.
//
//   POST /functions/v1/curate
//   { action: "curate", context: "my_day" | "games" | "slide_game",
//     history: [{ type, id_or_ref, thumbs, opened, finished, played }],
//     current: { ref?: "PSA.23.1-4", hymn_id? },
//     catalog: { hymns: [ids], prayers: [ids], refs: ["PSA.23.1-4", …] } }
//   -> 200 { suggestions: [{ module_type, id_or_ref, reason }], game: { type, difficulty, ref, reason } | null,
//            source: "ai" | "fallback" }
//
//   POST { action: "today", mood: 1-5, history, catalog }      ("Chosen for you")
//   -> 200 { verse: { ref: "PSA.46.1-1", reason }, picks: [{ module_type, id_or_ref, reason }] (4), source }
//   The model reasons step by step (prompt.ts), then gives a REFERENCE only; it is checked
//   (real book/chapter, 1-3 verses, found on YouVersion) or replaced by an example verse.
//   Only the mood number is sent: no names, and nothing about the mood is stored or logged.
//
//   POST { action: "trivia", reference: "Psalm 23:1-4", verses: [{ num, text }] }
//   -> 200 { questions: [{ q, answer, choices, verse }], source }   (fewer than 2 valid: [])
//
// Only ids, references, module types and 👍/👎 counts are sent here; no names. Verse text is
// used for this one request and never stored or logged.
//
// Provider (one adapter, `complete()`): Gloo AI (GLOO_AI_API_KEY, or GLOO_CLIENT_ID +
// GLOO_CLIENT_SECRET), else any OpenAI-compatible API (LLM_API_URL + LLM_API_KEY + LLM_MODEL).
// With no key at all, the function still answers: with the fallback.
//
// Settings: ALLOWED_PAGES_HOSTS, CURATE_RATE_PER_IP / CURATE_RATE_TOTAL (per minute, default
// 30 / 300, counted in Postgres via the same youversion_rate_hit RPC), CURATE_TIMEOUT_MS (4000).

import { allowedOrigin, limitKey } from "../youversion/lib.ts";
import {
  type Catalog, checkVerseRef, cleanCatalog, cleanPrompt, cleanHistory, cleanVerses, curatePrompt, exampleVerse, fallback, fillPicks,
  intersect, parseJson, stripThinking, todayPrompt, triviaPrompt, validate, validatePicks, validateQuestions,
} from "./lib.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const PAGES_HOSTS = env("ALLOWED_PAGES_HOSTS", "hymnal-reader-v2.pages.dev").split(",").map((s) => s.trim()).filter(Boolean);
const SUPABASE_URL = env("SUPABASE_URL");
const ANON_KEY = env("SUPABASE_ANON_KEY");
const PER_IP = Number(env("CURATE_RATE_PER_IP", "30"));
const TOTAL = Number(env("CURATE_RATE_TOTAL", "300"));
const TIMEOUT = Number(env("CURATE_TIMEOUT_MS", "4000"));

// ---------------------------------------------------------------------------
// The provider adapter: (system, user) -> reply text. Swap providers here only.
// ---------------------------------------------------------------------------

const GLOO_URL = env("GLOO_AI_URL", "https://platform.ai.gloo.com/ai/v2/guarded/chat/completions");
let glooToken: { value: string; until: number } | null = null;

async function glooAuth(): Promise<string | null> {
  if (env("GLOO_AI_API_KEY")) return env("GLOO_AI_API_KEY");
  const id = env("GLOO_CLIENT_ID"), secret = env("GLOO_CLIENT_SECRET");
  if (!id || !secret) return null;
  if (glooToken && glooToken.until > Date.now()) return glooToken.value;
  const res = await fetch("https://platform.ai.gloo.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${id}:${secret}`)}` },
    body: "grant_type=client_credentials&scope=api/access",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`gloo token ${res.status}`);
  const t = await res.json();
  glooToken = { value: t.access_token, until: Date.now() + (Number(t.expires_in ?? 3600) - 60) * 1000 };
  return glooToken.value;
}

export const provider = () =>
  env("GLOO_AI_API_KEY") || env("GLOO_CLIENT_ID") ? "gloo" : env("LLM_API_KEY") ? "openai-compatible" : "none";

async function complete(system: string, user: string, timeoutMs = TIMEOUT, maxTokens = 700, temperature = 0.3): Promise<string> {
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  let url: string, key: string | null, body: Record<string, unknown>;
  if (provider() === "gloo") {
    url = GLOO_URL;
    key = await glooAuth();
    body = { messages, auto_routing: true, temperature, max_tokens: maxTokens };
  } else if (provider() === "openai-compatible") {
    url = env("LLM_API_URL", "https://api.openai.com/v1/chat/completions");
    key = env("LLM_API_KEY");
    body = { model: env("LLM_MODEL", "gpt-4o-mini"), messages, temperature, max_tokens: maxTokens };
  } else {
    throw new Error("no AI provider configured");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`provider ${res.status}`);
  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "");
}

// ---------------------------------------------------------------------------
// What is published right now (read with the anon key: RLS shows published rows only).
// ---------------------------------------------------------------------------

async function rest(path: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`rest ${res.status}`);
  return res.json();
}

async function published(): Promise<{ catalog: Catalog; titles: { hymns: Record<string, string>; prayers: Record<string, string> } }> {
  const [hymns, prayers, items, refs] = await Promise.all([
    rest("hymns?select=id,title,audio_path"),
    rest("prayers?select=id,title"),
    rest("study_plan_items?select=config&module_type=eq.scripture").catch(() => []),
    rest("hymn_scripture_refs?select=book,chapter,verse_start,verse_end&verse_start=not.is.null&verse_end=not.is.null&limit=2000").catch(() => []),
  ]);
  const refKeys = new Set<string>();
  const add = (b: unknown, c: unknown, s: unknown, e: unknown) => {
    const [cn, sn, en] = [Number(c), Number(s), Number(e)];
    if (typeof b === "string" && cn > 0 && sn > 0 && en >= sn && en - sn <= 11) refKeys.add(`${b}.${cn}.${sn}-${en}`);
  };
  for (const i of items) { const c = i.config as Record<string, unknown>; add(c?.book, c?.chapter, c?.start, c?.end); }
  for (const r of refs) if (Number(r.verse_end) > Number(r.verse_start)) add(r.book, r.chapter, r.verse_start, r.verse_end);
  const withAudio = hymns.filter((x) => x.audio_path);
  return {
    catalog: { hymns: withAudio.map((x) => String(x.id)), prayers: prayers.map((x) => String(x.id)), refs: [...refKeys] },
    titles: {
      hymns: Object.fromEntries(withAudio.map((x) => [String(x.id), String(x.title)])),
      prayers: Object.fromEntries(prayers.map((x) => [String(x.id), String(x.title)])),
    },
  };
}

// ---------------------------------------------------------------------------

async function rateHit(ip: string): Promise<number | null> {
  try {
    const keys = [await limitKey(ANON_KEY, `curate:${ip}`), await limitKey(ANON_KEY, "curate:*")];
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/youversion_rate_hit`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_keys: keys, p_limits: [PER_IP, TOTAL] }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`rate_hit ${res.status}`);
    return Number(await res.json());
  } catch (e) {
    console.error("rate limit check failed", e);
    return null; // fail open, like youversion
  }
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}

async function curate(input: Record<string, unknown>) {
  const context = ["my_day", "games", "slide_game"].includes(String(input.context)) ? String(input.context) : "my_day";
  const history = cleanHistory(input.history);
  const { catalog: live, titles } = await published();
  // The tablet's catalog narrows the choice; the live published catalog has the last word.
  const asked = cleanCatalog(input.catalog);
  const cat = asked.hymns.length + asked.prayers.length + asked.refs.length ? intersect(asked, live) : live;
  const cur = String((input.current as Record<string, unknown>)?.ref ?? "");
  const currentRef = /^[1-3A-Z]{3}\.\d{1,3}\.\d{1,3}-\d{1,3}$/.test(cur) ? cur : null;

  // Cold start: nothing known yet, so a varied random mix (no AI call needed).
  if (!history.length && context === "my_day") return fallback(cat, history, context, currentRef);
  try {
    const { system, user } = curatePrompt(context, cat, titles, history, currentRef);
    const result = validate(parseJson(await complete(system, user)), cat, history, context, currentRef);
    if (result) return result;
  } catch (e) {
    console.error("curate: using fallback", String(e));
  }
  const fb = fallback(cat, history, context, currentRef);
  if (context === "my_day") fb.suggestions = fb.suggestions.sort(() => Math.random() - 0.5).slice(0, 2);
  return fb;
}

/** Does YouVersion have this passage? (asks our own youversion function; false on any error) */
async function passageExists(key: string): Promise<boolean> {
  const [book, chapter, range] = key.split(".");
  const [start, end] = range.split("-");
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/youversion?book=${book}&chapter=${chapter}&start=${start}&end=${end}`,
      { signal: AbortSignal.timeout(TODAY_CHECK_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

const TODAY_TIMEOUT = Number(env("CURATE_TODAY_TIMEOUT_MS", "9000")); // step-by-step thinking takes longer
const TODAY_CHECK_MS = 2500;

async function today(input: Record<string, unknown>) {
  const level = Math.round(Number(input.mood));
  if (!(level >= 1 && level <= 5)) return null;
  const history = cleanHistory(input.history);
  const { catalog: live, titles } = await published();
  const asked = cleanCatalog(input.catalog);
  const cat = asked.hymns.length + asked.prayers.length ? intersect(asked, live) : live;

  // The Studio-edited guidance and examples (table ai_prompts); defaults if unreadable.
  const prompt = cleanPrompt((await rest("ai_prompts?id=eq.today&select=guidance,examples").catch(() => []))[0]);
  let verse: { ref: string; reason: string } | null = null;
  let picks: ReturnType<typeof validatePicks> = [];
  let source: "ai" | "fallback" = "fallback";
  try {
    const { system, user } = todayPrompt(level, cat, titles, history, prompt);
    const reply = parseJson(stripThinking(await complete(system, user, TODAY_TIMEOUT, 900, 0.8) /* more variety: a different fitting verse on different days */)) as Record<string, any> | null;
    const ref = checkVerseRef(reply?.verse?.ref);
    // Saves a YouVersion call (they're rate-limited): the vetted examples are known to exist.
    const known = ref ? prompt.examples.some((e) => e.refs.includes(ref)) : false;
    if (ref && (known || await passageExists(ref))) {
      verse = { ref, reason: String(reply?.verse?.reason ?? "").slice(0, 160) };
      picks = validatePicks(reply?.picks, cat, history, ref);
      source = "ai";
    }
  } catch (e) {
    console.error("today: using fallback", String(e));
  }
  verse ??= { ref: exampleVerse(level, Math.random, prompt.examples), reason: "One of the example passages for this feeling" };
  return { verse, picks: fillPicks(picks, cat, history, verse.ref), source };
}

async function trivia(input: Record<string, unknown>) {
  const verses = cleanVerses(input.verses);
  const reference = String(input.reference ?? "").slice(0, 60);
  if (!verses.length) return { questions: [], source: "fallback" };
  try {
    const { system, user } = triviaPrompt(reference, verses);
    const questions = validateQuestions(parseJson(await complete(system, user)), verses);
    if (questions.length >= 2) return { questions, source: "ai" };
  } catch (e) {
    console.error("trivia: using fallback", String(e));
  }
  return { questions: [], source: "fallback" }; // the tablet builds fill-in-the-blank questions
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors: Record<string, string> = { "Vary": "Origin" };
  if (allowedOrigin(origin, PAGES_HOSTS)) {
    cors["Access-Control-Allow-Origin"] = origin!;
    cors["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    cors["Access-Control-Allow-Headers"] = "authorization, apikey, x-client-info, content-type";
    cors["Access-Control-Max-Age"] = "86400";
  } else if (origin) {
    return json({ error: "This origin is not allowed." }, 403, cors);
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405, cors);

  const raw = await req.text();
  if (raw.length > 64_000) return json({ error: "Request too large." }, 413, cors);
  let input: Record<string, unknown>;
  try { input = JSON.parse(raw); } catch { return json({ error: "Send JSON." }, 400, cors); }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const left = await rateHit(ip);
  if (left === -1) return json({ error: "Too many requests. Try again in a minute." }, 429, { ...cors, "Retry-After": "60" });

  try {
    if (input.action === "trivia") return json(await trivia(input), 200, cors);
    if (input.action === "today") {
      const result = await today(input);
      return result ? json({ ...result, provider: provider() }, 200, cors) : json({ error: "mood must be 1-5" }, 400, cors);
    }
    return json({ ...(await curate(input)), provider: provider() }, 200, cors);
  } catch (e) {
    console.error(e);
    return json({ error: "Curation is unavailable." }, 502, cors); // the tablet falls back
  }
});
