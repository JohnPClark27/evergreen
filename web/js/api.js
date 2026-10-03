// api.js - everything the public app reads.
//
// - Published content from Supabase with the publishable (anon) key. RLS only lets this
//   key see rows whose status is 'published', so drafts can never leak into the app.
// - Scripture from the youversion Edge Function (the YouVersion key stays server-side).
// - Hymn files from public Storage URLs.
//
// Needs, before this module runs:
//   <script src="config.js"></script>                       (window.HYMNAL_CONFIG)
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js" ...>
// (pinned version + SRI hash, see SUPABASE_JS below)

export const SUPABASE_JS = {
  src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js',
  integrity: 'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok',
};

const { supabaseUrl, supabaseAnonKey } = window.HYMNAL_CONFIG ?? {};
if (!supabaseUrl || !supabaseAnonKey) throw new Error('web/config.js is missing (see config.example.js)');
if (!window.supabase?.createClient) throw new Error('supabase-js did not load');

// No logins in this app: don't store or refresh any auth session.
const db = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const HYMN_FIELDS = 'id,number,title,tune,first_line,meter,stanza_count,audio_path,timing_path,abc_path,timing_verified,is_familiar';
const PRAYER_FIELDS = 'id,slug,title,text,source,section,attribution';
const STUDY_FIELDS = `id,title,book,chapter,verse_start,verse_end,aide_note,
  hymn:hymns(${HYMN_FIELDS}), prayer:prayers(${PRAYER_FIELDS})`;

// Remember results for the whole session (one promise per key, so parallel callers share one
// request). A failed request is forgotten so it can be retried.
function memo(map, key, load) {
  if (!map.has(key)) map.set(key, load().catch((err) => { map.delete(key); throw err; }));
  return map.get(key);
}
const cache = { queries: new Map(), passages: new Map(), timings: new Map() };

async function rows(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

// ---------- Hymns ----------

export const getHymns = () =>
  memo(cache.queries, 'hymns', () => rows(db.from('hymns').select(HYMN_FIELDS).order('number')));

export const getFamiliarHymns = async () => (await getHymns()).filter((h) => h.is_familiar);

export async function getHymn(number) {
  return (await getHymns()).find((h) => h.number === Number(number)) ?? null;
}

/** Published hymns whose scripture refs cover a chapter (verse matches first). For Read the Bible. */
export async function hymnsForChapter(book, chapter, verse = null) {
  const refs = await rows(db.from('hymn_scripture_refs')
    .select('hymn_id,verse_start,verse_end').eq('book', book).eq('chapter', chapter));
  const hymns = new Map((await getHymns()).map((h) => [h.id, h]));
  const hit = (r) => verse != null && r.verse_start != null
    && verse >= Math.min(r.verse_start, r.verse_end ?? 999) && verse <= Math.max(r.verse_start, r.verse_end ?? 999);
  const best = new Map(); // hymn_id -> 'verse' | 'chapter'
  for (const r of refs) {
    if (!hymns.has(r.hymn_id)) continue;
    if (hit(r)) best.set(r.hymn_id, 'verse');
    else if (!best.has(r.hymn_id)) best.set(r.hymn_id, 'chapter');
  }
  return [...best].map(([id, level]) => ({ ...hymns.get(id), matchLevel: level }))
    .sort((a, b) => (a.matchLevel === b.matchLevel ? a.title.localeCompare(b.title) : a.matchLevel === 'verse' ? -1 : 1));
}

/** A published hymn's scripture refs: [{book, chapter, verse_start, verse_end}]. */
export const getHymnRefs = (hymnId) => memo(cache.queries, `refs:${hymnId}`, () =>
  rows(db.from('hymn_scripture_refs').select('book,chapter,verse_start,verse_end').eq('hymn_id', hymnId).order('id')));

/** Published hymns WITH AUDIO that cite a chapter, as [{hymn, verse_start, verse_end}]
 * (verse_start null = the whole chapter). For Read the Bible's background music. */
export const getChapterHymns = (book, chapter) => memo(cache.queries, `ch:${book}.${chapter}`, async () => {
  const refs = await rows(db.from('hymn_scripture_refs')
    .select('hymn_id,verse_start,verse_end').eq('book', book).eq('chapter', chapter));
  const hymns = new Map((await getHymns()).filter((h) => h.audio_path).map((h) => [h.id, h]));
  return refs.filter((r) => hymns.has(r.hymn_id))
    .map((r) => ({ hymn: hymns.get(r.hymn_id), verse_start: r.verse_start, verse_end: r.verse_end }));
});

// ---------- Plans, studies, prayers ----------

/** Published study plans for the tablet's list: [{id, title, description, types: [module_type…]}]. */
// A study plan holds studies; a study holds modules. Both come back in order:
//   { id, title, description, studies: [{ id, position, title, key, items: [{ module_type, config? }] }] }
// `key` identifies a study for this tablet's progress (see store.js): its title, so a ✓
// survives the pastor re-saving or reordering the plan.
function shapePlan(p) {
  p.studies = (p.studies ?? []).sort((a, b) => a.position - b.position).map((s) => ({
    ...s,
    key: s.title.trim().toLowerCase(),
    items: (s.items ?? []).sort((a, b) => a.position - b.position),
  }));
  return p;
}

/** Every published study plan, with its studies' module types (for the list cards). */
export const getStudyPlans = () => memo(cache.queries, 'studyPlans', async () => {
  const plans = await rows(db.from('study_plans')
    .select('id,title,description,updated_at,studies:plan_studies(id,position,title,items:study_plan_items(position,module_type))')
    .order('title'));
  return plans.map(shapePlan);
});

/** One published study plan with every study's modules (and their settings), or null. */
export const getStudyPlan = (id) => memo(cache.queries, `studyPlan:${id}`, async () => {
  const found = await rows(db.from('study_plans')
    .select('id,title,description,studies:plan_studies(id,position,title,items:study_plan_items(position,module_type,config))')
    .eq('id', id));
  return found.length ? shapePlan(found[0]) : null;
});

export const getHymnById = async (id) => (await getHymns()).find((x) => x.id === Number(id)) ?? null;
export const getPrayerById = async (id) => (await getPrayers()).find((x) => x.id === Number(id)) ?? null;

export const getPrayers = () =>
  memo(cache.queries, 'prayers', () => rows(db.from('prayers').select(PRAYER_FIELDS).order('title')));

// ---------- Storage ----------

export function storageUrl(bucket, key) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURIComponent(key)}`;
}
export const audioUrl = (hymn) => (hymn?.audio_path ? storageUrl('hymn-audio', hymn.audio_path) : null);

/** A hymn's timing JSON (words + timings + ABC): see CLAUDE.md "Timing JSON". */
export function getTiming(hymn) {
  if (!hymn?.timing_path) return Promise.reject(new Error('This hymn has no words file.'));
  return memo(cache.timings, hymn.timing_path, async () => {
    const res = await fetch(storageUrl('hymn-timings', hymn.timing_path));
    if (!res.ok) throw new Error(`Couldn't load the words (${res.status}).`);
    return res.json();
  });
}

// ---------- Scripture ----------

/** Verses from YouVersion via the Edge Function: { reference, verses: [{num, text}], attribution }.
 * Kept in memory for the session only (never stored). */
export function getPassage(book, chapter, start = null, end = null) {
  const key = `${book}.${chapter}.${start ?? ''}-${end ?? ''}`;
  return memo(cache.passages, key, async () => {
    const params = new URLSearchParams({ book, chapter });
    if (start != null) params.set('start', start);
    if (end != null) params.set('end', end);
    const res = await fetch(`${supabaseUrl}/functions/v1/youversion?${params}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Scripture couldn't be loaded (${res.status}).`);
    return body;
  });
}
