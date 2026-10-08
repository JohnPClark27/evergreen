// youversion - Scripture proxy for Hymnal Reader.
//
//   GET /functions/v1/youversion?book=PSA&chapter=23&start=1&end=3
//   -> 200 { reference, book, chapter, verses: [{num, text}], version: {id, abbreviation, title},
//            attribution, source: "YouVersion" }
//   -> 400 { error } for a bad reference (unknown book, chapter out of range, bad verses)
//
// The YouVersion App Key stays here (Supabase secret YOUVERSION_API_KEY); browsers never see it.
// Scripture text is never stored in the database: it's fetched live and, as YouVersion's docs
// recommend, cached in memory for a while (YOUVERSION_CACHE_TTL_SECONDS, 0 = off).
//
// Settings (Supabase secrets / env):
//   YOUVERSION_API_KEY               required
//   YOUVERSION_API_KEY_BACKUP        optional: used when YouVersion refuses the main key
//                                    (429 rate limit / quota, 401, 403), e.g. a second app key
//   YOUVERSION_BIBLE_ID              default 12 (ASV)
//   YOUVERSION_CACHE_TTL_SECONDS     chapter text cache, default 86400 (1 day)
//   YOUVERSION_META_TTL_SECONDS      version + attribution cache, default 3600 (kept short so
//                                    the required attribution stays current)
//   ALLOWED_PAGES_HOSTS              default evergreen-ai.pages.dev,hymnal-reader-v2.pages.dev (+ preview subdomains;
//                                    the old address goes once the move to Evergreen is done)
//   RATE_LIMIT_PER_IP / RATE_LIMIT_TOTAL   requests per minute, default 60 / 600 (counted in
//                                    Postgres: public.youversion_rate_hit)

import { allowedOrigin, label, limitKey, parseRef, parseVerses, TtlCache } from "./lib.ts";

const API = "https://api.youversion.com/v1";
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const KEY = env("YOUVERSION_API_KEY");
// Keys to try, in order: the main one, then the backup (if set).
const KEYS = [KEY, env("YOUVERSION_API_KEY_BACKUP")].filter(Boolean);
// Answers that mean "this key can't be used right now": try the next key.
const KEY_REFUSED = new Set([401, 403, 429]);
const BIBLE_ID = env("YOUVERSION_BIBLE_ID", "12");
const PAGES_HOSTS = env("ALLOWED_PAGES_HOSTS", "evergreen-ai.pages.dev,hymnal-reader-v2.pages.dev").split(",").map((s) => s.trim()).filter(Boolean);

const chapterCache = new TtlCache<{ num: number; text: string }[]>(Number(env("YOUVERSION_CACHE_TTL_SECONDS", "86400")));
const metaCache = new TtlCache<{ id: string; abbreviation: string; title: string; attribution: string }>(
  Number(env("YOUVERSION_META_TTL_SECONDS", "3600")), 10);
const PER_IP = Number(env("RATE_LIMIT_PER_IP", "60"));
const TOTAL = Number(env("RATE_LIMIT_TOTAL", "600"));
// Injected by Supabase into every Edge Function. Only the anon key is used here:
// the service role key never touches this function.
const SUPABASE_URL = env("SUPABASE_URL");
const ANON_KEY = env("SUPABASE_ANON_KEY");

/** Count this request; returns requests left for this client, -1 if over the limit,
 * or null if the counter is unreachable (then we let the request through: fail open). */
async function rateHit(ip: string): Promise<number | null> {
  try {
    const secret = KEY || ANON_KEY; // any server-only secret works as the hash salt
    const keys = [await limitKey(secret, ip), await limitKey(secret, "*")];
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
    return null;
  }
}

class Upstream extends Error {
  status: number;
  retryAfter: string | null;
  constructor(status: number, retryAfter: string | null = null) {
    super(`YouVersion ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function yv(path: string) {
  let last: Upstream | null = null;
  for (const [i, key] of KEYS.entries()) {
    const res = await fetch(`${API}${path}`, { headers: { "X-YVP-App-Key": key }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return res.json();
    // Error bodies may be plain text (429 is), so don't parse them.
    console.error("YouVersion error", res.status, path, i === 0 ? "(main key)" : "(backup key)");
    last = new Upstream(res.status, res.headers.get("Retry-After"));
    if (!KEY_REFUSED.has(res.status)) break; // e.g. 404: the backup key wouldn't help
  }
  throw last ?? new Upstream(-1);
}

async function version() {
  const hit = metaCache.get(BIBLE_ID);
  if (hit) return hit;
  const v = await yv(`/bibles/${BIBLE_ID}`);
  // Required attribution: the version's copyright, else its promotional content (per YouVersion docs).
  // Public-domain versions (like ASV) may have neither, so fall back to the version's own name.
  // "Scripture provided by YouVersion" is always added.
  const name = [v.title, v.abbreviation && `(${v.abbreviation})`].filter(Boolean).join(" ");
  const versionText = (v.copyright ?? "").trim() || (v.promotional_content ?? "").trim() || name;
  if (!versionText) throw new Upstream(-1); // nothing to attribute: refuse rather than show unattributed text
  const attribution = `${versionText} · Scripture provided by YouVersion.`;
  const meta = { id: String(v.id ?? BIBLE_ID), abbreviation: v.abbreviation ?? "", title: v.title ?? "", attribution };
  metaCache.set(BIBLE_ID, meta);
  return meta;
}

async function chapterVerses(book: string, chapter: number) {
  const key = `${BIBLE_ID}:${book}.${chapter}`;
  const hit = chapterCache.get(key);
  if (hit) return hit;
  // Whole chapter, then slice: one cached chapter serves every verse range in it.
  const data = await yv(`/bibles/${BIBLE_ID}/passages/${book}.${chapter}?format=html`);
  const verses = parseVerses(data.content ?? "");
  chapterCache.set(key, verses);
  return verses;
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors: Record<string, string> = { "Vary": "Origin" };
  if (allowedOrigin(origin, PAGES_HOSTS)) {
    cors["Access-Control-Allow-Origin"] = origin!;
    cors["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    cors["Access-Control-Allow-Headers"] = "authorization, apikey, x-client-info, content-type";
    cors["Access-Control-Max-Age"] = "86400";
  } else if (origin) {
    // A browser on some other site: refuse early so it can't spend our API quota.
    return json({ error: "This origin is not allowed." }, 403, cors);
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "Use GET." }, 405, cors);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ref = parseRef(new URL(req.url).searchParams);
  if (typeof ref === "string") return json({ error: ref }, 400, cors); // bad input costs nothing

  const left = await rateHit(ip);
  if (left === -1) return json({ error: "Too many requests. Try again in a minute." }, 429, { ...cors, "Retry-After": "60" });
  if (left !== null) cors["X-RateLimit-Remaining"] = String(left);
  if (!KEY) return json({ error: "Scripture service is not configured (YOUVERSION_API_KEY missing)." }, 500, cors);

  try {
    const [meta, all] = await Promise.all([version(), chapterVerses(ref.book, ref.chapter)]);
    const verses = ref.start === null ? all : all.filter((v) => v.num >= ref.start! && v.num <= ref.end!);
    if (!verses.length) {
      const last = all.at(-1)?.num;
      return json({ error: `${label(ref)} not found${last ? `: this chapter has verses 1-${last}` : ""}.` }, 400, cors);
    }
    return json({
      reference: label(ref),
      book: ref.book,
      chapter: ref.chapter,
      verses,
      version: { id: meta.id, abbreviation: meta.abbreviation, title: meta.title },
      attribution: meta.attribution,
      source: "YouVersion",
    }, 200, { ...cors, "Cache-Control": "public, max-age=3600" });
  } catch (e) {
    if (e instanceof Upstream) {
      if (e.status === 429) {
        return json({ error: "Scripture service is busy. Try again shortly." }, 503,
          { ...cors, "Retry-After": e.retryAfter ?? "60" });
      }
      if (e.status === 404) return json({ error: `${label(ref)} was not found.` }, 400, cors);
      // The upstream status isn't secret and makes problems diagnosable (e.g. 403 = Bible not licensed).
      return json({ error: `Scripture service error (YouVersion ${e.status}).` }, 502, cors);
    }
    console.error(e);
    return json({ error: "Scripture service is unavailable." }, 502, cors);
  }
});
