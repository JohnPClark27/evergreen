// db.js - the Studio's ONE place for talking to Supabase, as the signed-in person.
//
// Safety lives in the database, not here: Row Level Security decides what each person can
// read and change, a trigger stops authors publishing their own plans, and every change is
// written to the audit log by triggers. This file never sees the service role key.

const { supabaseUrl, supabaseAnonKey } = window.HYMNAL_CONFIG ?? {};
export const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
  // Authors stay signed in on this computer (separate storage key from anything else).
  // PKCE: the email link comes back as ?code=… (not #…), so it can't clash with our #/ routes.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'hr-studio-auth' },
});

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(friendly(error.message));
  return data;
}

/** Turn database messages into something an author can act on. */
function friendly(msg = '') {
  if (/row-level security|permission denied/i.test(msg)) return 'You don’t have permission to do that.';
  if (/module_config_ok|study_plan_items_check/i.test(msg)) return 'One of the modules is missing something (check the red notes).';
  if (/JWT|session/i.test(msg)) return 'Your sign-in expired: please sign in again.';
  return msg;
}

// ---------- sign-in ----------

export async function session() {
  return (await sb.auth.getSession()).data.session;
}
export const onAuthChange = (fn) => sb.auth.onAuthStateChange((event, s) => fn(event, s));

/** Email a magic sign-in link that comes back to this page. */
export async function sendSignInLink(email) {
  const back = `${location.origin}${location.pathname}`;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: back } });
  if (error) {
    if (/rate limit/i.test(error.message)) throw new Error('Too many sign-in emails were sent recently. Please wait a while and try again.');
    throw new Error(error.message);
  }
}
export const signOut = () => sb.auth.signOut();

export async function myProfile() {
  const uid = (await session())?.user.id;
  return (await q(sb.from('profiles').select('id,display_name,role').eq('id', uid)))[0] ?? null;
}
export const setDisplayName = async (name) =>
  q(sb.from('profiles').update({ display_name: name.trim() || null }).eq('id', (await session()).user.id));

// ---------- the library modules pick from (published only) ----------

/** { hymns, prayers, hymn(id), prayer(id) } — what editors and validators use. */
export async function loadLibrary() {
  const [hymns, prayers] = await Promise.all([
    q(sb.from('hymns').select('id,number,title,first_line,stanza_count,timing_verified,is_familiar,audio_path')
      .eq('status', 'published').order('title')),
    q(sb.from('prayers').select('id,slug,title,text,source,attribution').eq('status', 'published').order('title')),
  ]);
  const byHymn = new Map(hymns.map((x) => [x.id, x]));
  const byPrayer = new Map(prayers.map((x) => [x.id, x]));
  return { hymns, prayers, hymn: (id) => byHymn.get(Number(id)), prayer: (id) => byPrayer.get(Number(id)) };
}

// ---------- study plans ----------

const PLAN_FIELDS = 'id,title,description,status,review_note,owner_id,submitted_at,reviewed_at,updated_at,owner:profiles!study_plans_owner_id_fkey(display_name)';

export async function myPlans() {
  const uid = (await session()).user.id;
  return q(sb.from('study_plans').select(`${PLAN_FIELDS},items:study_plan_items(module_type)`)
    .eq('owner_id', uid).order('updated_at', { ascending: false }));
}

/** Admin: every plan, optionally one status. */
export const allPlans = (status = null) => {
  let query = sb.from('study_plans').select(`${PLAN_FIELDS},items:study_plan_items(module_type)`).order('updated_at', { ascending: false });
  if (status) query = query.eq('status', status);
  return q(query);
};

export async function getPlan(id) {
  const rows = await q(sb.from('study_plans').select(`${PLAN_FIELDS},items:study_plan_items(position,module_type,config)`).eq('id', id));
  if (!rows.length) return null;
  rows[0].items.sort((a, b) => a.position - b.position);
  return rows[0];
}

/** Save title, description and ALL modules in one transaction. Returns the plan id. */
export const savePlan = (id, title, description, items) => q(sb.rpc('save_study_plan', {
  p_id: id ?? null, p_title: title, p_description: description || null,
  p_items: items.map((i) => ({ type: i.module_type, config: i.config })),
}));

export const setPlanStatus = (id, status) => q(sb.from('study_plans').update({ status }).eq('id', id).select('id'));
export const deletePlan = (id) => q(sb.from('study_plans').delete().eq('id', id));
export const planProblems = (id) => q(sb.rpc('study_plan_problems', { p_id: id }));
export const reviewPlan = (id, approve, note) => q(sb.rpc('review_study_plan', { p_id: id, p_approve: approve, p_note: note ?? null }));

// ---------- admin: libraries, people, audit ----------

export const allHymns = () => q(sb.from('hymns')
  .select('id,number,title,first_line,status,is_familiar,audio_path,abc_path,timing_verified,stanza_count').order('number'));
export const updateHymn = (id, patch) => q(sb.from('hymns').update(patch).eq('id', id).select('id,status,is_familiar'));

export const allPrayers = () => q(sb.from('prayers').select('*').order('title'));
export const savePrayer = (id, values) => (id
  ? q(sb.from('prayers').update(values).eq('id', id).select('*'))
  : q(sb.from('prayers').insert(values).select('*')));

export const listPeople = () => q(sb.rpc('admin_list_users'));
export const setRole = (userId, role) => q(sb.rpc('set_user_role', { p_user: userId, p_role: role }));

export const auditLog = (table = null, limit = 200) => {
  let query = sb.from('audit_log').select('*').order('at', { ascending: false }).limit(limit);
  if (table) query = query.eq('table_name', table);
  return q(query);
};

/** A hymn's ABC text from public Storage (for the public-domain check). */
export async function hymnAbc(hymn) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/public/hymn-abc/${encodeURIComponent(hymn.abc_path)}`);
  if (!res.ok) throw new Error(`Couldn't read the hymn file (${res.status}).`);
  return res.text();
}
