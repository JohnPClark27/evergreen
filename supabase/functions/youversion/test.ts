// Local tests for lib.ts (no network, no Deno needed):
//   node supabase/functions/youversion/test.ts
import assert from "node:assert/strict";
import { allowedOrigin, label, limitKey, parseRef, parseVerses, TtlCache } from "./lib.ts";

const q = (s: string) => parseRef(new URLSearchParams(s));
let n = 0;
const check = (name: string, fn: () => void) => { fn(); n++; console.log("PASS", name); };

check("valid range", () => assert.deepEqual(q("book=psa&chapter=23&start=1&end=3"), { book: "PSA", chapter: 23, start: 1, end: 3 }));
check("single verse", () => assert.deepEqual(q("book=JHN&chapter=3&start=16"), { book: "JHN", chapter: 3, start: 16, end: 16 }));
check("whole chapter", () => assert.deepEqual(q("book=PSA&chapter=23"), { book: "PSA", chapter: 23, start: null, end: null }));
check("unknown book", () => assert.match(q("book=XYZ&chapter=1") as string, /Unknown book/));
check("missing book", () => assert.match(q("chapter=1") as string, /Missing 'book'/));
check("chapter too high", () => assert.equal(q("book=1TH&chapter=6"), "1 Thessalonians has chapters 1-5, not 6."));
check("chapter not a number", () => assert.match(q("book=PSA&chapter=abc") as string, /whole number/));
check("end before start", () => assert.match(q("book=PSA&chapter=23&start=4&end=2") as string, /before/));
check("end without start", () => assert.match(q("book=PSA&chapter=23&end=2") as string, /needs a 'start'/));
check("too many verses", () => assert.match(q("book=PSA&chapter=119&start=1&end=176") as string, /at most/));
check("label", () => assert.equal(label({ book: "PSA", chapter: 23, start: 1, end: 3 }), "Psalm 23:1-3"));

check("parseVerses", () => {
  const html = '<div class="p"><span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Jehovah is my shepherd; I shall not want.</div>'
    + '<div class="p"><span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>He <span class="nd">maketh</span> me &amp; &quot;x&quot;</div>';
  assert.deepEqual(parseVerses(html), [
    { num: 1, text: "Jehovah is my shepherd; I shall not want." },
    { num: 2, text: 'He maketh me & "x"' },
  ]);
});

const hosts = ["hymnal-reader-v2.pages.dev"];
check("CORS: production", () => assert.ok(allowedOrigin("https://hymnal-reader-v2.pages.dev", hosts)));
check("CORS: dev preview", () => assert.ok(allowedOrigin("https://dev.hymnal-reader-v2.pages.dev", hosts)));
check("CORS: localhost any port", () => assert.ok(allowedOrigin("http://localhost:8080", hosts)));
check("CORS: other site", () => assert.ok(!allowedOrigin("https://evil.example", hosts)));
check("CORS: lookalike host", () => assert.ok(!allowedOrigin("https://hymnal-reader-v2.pages.dev.evil.example", hosts)));
check("CORS: http pages", () => assert.ok(!allowedOrigin("http://hymnal-reader-v2.pages.dev", hosts)));

// limitKey is async, so compute the keys first, then check them.
const k1 = await limitKey("secret", "1.2.3.4");
const k1again = await limitKey("secret", "1.2.3.4");
const kOtherSecret = await limitKey("other", "1.2.3.4");
check("limit key: hashed (no raw IP)", () => {
  assert.match(k1, /^[0-9a-f]{40}$/);
  assert.ok(!k1.includes("1.2.3.4"));
});
check("limit key: stable", () => assert.equal(k1, k1again));
check("limit key: depends on the secret", () => assert.notEqual(k1, kOtherSecret));
check("ttl cache", () => {
  const c = new TtlCache<number>(10);
  c.set("k", 1, 0);
  assert.equal(c.get("k", 9_999), 1);
  assert.equal(c.get("k", 10_000), undefined);
  const off = new TtlCache<number>(0);
  off.set("k", 1, 0);
  assert.equal(off.get("k", 0), undefined, "TTL 0 disables caching");
});
console.log(`${n} passed`);
