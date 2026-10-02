// pd.js - the strict "fully public domain per the ABC file" rule, the same as
// supabase/seed/publish_pd_hymns.py (keep the two in step). A hymn passes when its file:
//   1. says "copyright: public domain" in a C:/S: line, and
//   2. has no credit line citing a source/setting from 1928 or later, and doesn't rely on a
//      copyright "never renewed" — except a modern setting the arranger explicitly
//      "released … to the public domain" (a dedication).

const HOUSEKEEPING = /Open Hymnal Project, \d{4} Revision|contributed to the Open Hymnal/i;
const DEDICATED = /released (in)?to the public domain|released .* to the public domain/i;

/** { ok, reason } for one ABC file. */
export function pdCheck(abcText) {
  const credits = abcText.split(/\r?\n/).filter((l) => /^[CS]:/.test(l)).map((l) => l.trim());
  if (!credits.some((l) => /copyright:\s*public domain/i.test(l))) {
    return { ok: false, reason: 'no “copyright: public domain” line' };
  }
  const dedicated = credits.some((l) => DEDICATED.test(l));
  for (const line of credits) {
    if (HOUSEKEEPING.test(line) || DEDICATED.test(line)) continue; // housekeeping / the dedication itself
    if (/never renewed/i.test(line)) return { ok: false, reason: `relies on non-renewal: ${line.slice(0, 90)}` };
    const modern = (line.match(/\b(19[2-9]\d|20\d\d)\b/g) ?? []).map(Number).filter((y) => y >= 1928);
    if (modern.length && !(dedicated && /setting|arrang|versification/i.test(line))) {
      return { ok: false, reason: `modern source/setting (${modern[0]}): ${line.slice(0, 90)}` };
    }
  }
  return { ok: true, reason: dedicated ? 'dedicated to the public domain' : 'public domain' };
}
