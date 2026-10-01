#!/usr/bin/env bash
# rls_anon_test.sh - prove that the public (anon/publishable) key can read ONLY
# published content and can't write anything, on the HOSTED project.
#
# How it works:
#   1. Inserts throwaway fixtures (draft + published copies of every table) through
#      `npx supabase db query --linked` (Management API, bypasses RLS).
#   2. Reads them back over the REST API with the key from web/config.js.
#   3. Tries to insert/update/delete with that key, and to read audit_log.
#   4. Deletes the fixtures (also on failure).
#
# Usage (from the repo root):  bash supabase/tests/rls_anon_test.sh
# Needs: curl, python3, npx supabase linked to the project.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

# URL + key straight from the public config, so we test exactly what the app ships.
URL=$(sed -n "s/.*supabaseUrl: *'\([^']*\)'.*/\1/p" web/config.js)
KEY=$(sed -n "s/.*supabaseAnonKey: *'\([^']*\)'.*/\1/p" web/config.js)
[[ -n "$URL" && -n "$KEY" ]] || { echo "Could not read URL/key from web/config.js"; exit 1; }
REST="$URL/rest/v1"
TAG='RLS TEST'   # every fixture carries this, so cleanup can find it

sql() { npx supabase db query --linked "$1" >/dev/null 2>&1 || { echo "SQL failed: $1"; return 1; }; }

cleanup() {
  sql "
    delete from public.plan_days where plan_id in (select id from public.plans where title like '$TAG%');
    delete from public.plans   where title like '$TAG%';
    delete from public.studies where title like '$TAG%';
    delete from public.prayers where slug  like 'rls-test-%';
    delete from public.hymns   where title like '$TAG%';           -- refs + hymn_topics cascade
    delete from public.topics  where name  like '$TAG%';
    delete from public.audit_log where actor = 'rls-test';"
}
trap cleanup EXIT

echo "==> Inserting fixtures (draft + published)"
cleanup
sql "
with h as (
  insert into public.hymns (number, source_file, title, status) values
    (90001, 'rls-test/published.abc', '$TAG published hymn', 'published'),
    (90002, 'rls-test/draft.abc',     '$TAG draft hymn',     'draft')
  returning id, status),
r as (
  insert into public.hymn_scripture_refs (hymn_id, book, chapter, verse_start, verse_end)
  select id, 'PSA', 23, 1, 3 from h returning 1),
t as (
  insert into public.topics (name) values ('$TAG topic of published'), ('$TAG topic of draft')
  returning id, name),
ht as (
  insert into public.hymn_topics (hymn_id, topic_id)
  select h.id, t.id from h join t on (h.status = 'published') = (t.name like '%of published')
  returning 1)
select 1;"
sql "
insert into public.prayers (slug, title, text, source, status) values
  ('rls-test-published', '$TAG published prayer', 'placeholder', 'test fixture', 'published'),
  ('rls-test-draft',     '$TAG draft prayer',     'placeholder', 'test fixture', 'draft');
insert into public.studies (title, hymn_id, book, chapter, verse_start, verse_end, prayer_id, status)
select '$TAG ' || s.status || ' study',
       (select id from public.hymns   where number = 90001),
       'PSA', 23, 1, 3,
       (select id from public.prayers where slug = 'rls-test-published'),
       s.status::public.content_status
from (values ('published'), ('draft')) s(status);
insert into public.plans (title, status) values
  ('$TAG published plan', 'published'), ('$TAG draft plan', 'draft');
-- published plan: day 1 -> published study (visible), day 2 -> draft study (hidden)
-- draft plan:     day 1 -> published study (hidden, parent is a draft)
insert into public.plan_days (plan_id, day_number, study_id) values
  ((select id from public.plans where title = '$TAG published plan'), 1, (select id from public.studies where title = '$TAG published study')),
  ((select id from public.plans where title = '$TAG published plan'), 2, (select id from public.studies where title = '$TAG draft study')),
  ((select id from public.plans where title = '$TAG draft plan'),     1, (select id from public.studies where title = '$TAG published study'));
insert into public.audit_log (actor, action, table_name, row_id) values ('rls-test', 'insert', 'hymns', '0');" || exit 1

pass=0; fail=0
check() {  # check "<name>" <expected> <actual>
  if [[ "$2" == "$3" ]]; then echo "  PASS  $1"; pass=$((pass + 1))
  else echo "  FAIL  $1 (expected $2, got $3)"; fail=$((fail + 1)); fi
}

# GET with the anon key; prints "<http status> <row count or -1>".
get() {
  local body status
  body=$(curl -s -w '\n%{http_code}' -H "apikey: $KEY" "$REST/$1")
  status=${body##*$'\n'}; body=${body%$'\n'*}
  printf '%s %s\n' "$status" "$(python3 -c 'import json,sys
try: d=json.loads(sys.stdin.read()); print(len(d) if isinstance(d,list) else -1)
except Exception: print(-1)' <<<"$body")"
}

# Write with the anon key; prints the HTTP status.
write() {  # write METHOD path [json]
  curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "apikey: $KEY" \
    -H 'Content-Type: application/json' -H 'Prefer: return=minimal' "$REST/$2" ${3:+-d "$3"}
}

T=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("RLS TEST*"))')

echo "==> Reads with the anon key (only published rows should come back)"
check "hymns: 1 of 2 visible"              "200 1" "$(get "hymns?select=id&title=like.$T")"
check "hymns: draft hidden"                "200 0" "$(get "hymns?select=id&number=eq.90002")"
check "hymn_scripture_refs: 1 of 2"        "200 1" "$(get "hymn_scripture_refs?select=id,hymns!inner(title)&hymns.title=like.$T")"
check "topics: 1 of 2"                     "200 1" "$(get "topics?select=id&name=like.$T")"
check "hymn_topics: 1 of 2"                "200 1" "$(get "hymn_topics?select=hymn_id,hymns!inner(title)&hymns.title=like.$T")"
check "prayers: 1 of 2"                    "200 1" "$(get "prayers?select=id&slug=like.rls-test-*")"
check "studies: 1 of 2"                    "200 1" "$(get "studies?select=id&title=like.$T")"
check "plans: 1 of 2"                      "200 1" "$(get "plans?select=id&title=like.$T")"
check "plan_days: 1 of 3"                  "200 1" "$(get "plan_days?select=id,plans!inner(title)&plans.title=like.$T")"
# Join tables queried directly by the hidden parent's id (no embedding), so only
# the join table's own policy can hide them.
read -r DH DP DS < <(npx supabase db query --linked "select
  (select id from public.hymns   where number = 90002) as dh,
  (select id from public.plans   where title = '$TAG draft plan') as dp,
  (select id from public.studies where title = '$TAG draft study') as ds" 2>/dev/null \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["rows"][0]; print(r["dh"], r["dp"], r["ds"])')
check "refs of draft hymn hidden"          "200 0" "$(get "hymn_scripture_refs?select=id&hymn_id=eq.$DH")"
check "hymn_topics of draft hymn hidden"   "200 0" "$(get "hymn_topics?select=hymn_id&hymn_id=eq.$DH")"
check "plan_days of draft plan hidden"     "200 0" "$(get "plan_days?select=id&plan_id=eq.$DP")"
check "plan_days with draft study hidden"  "200 0" "$(get "plan_days?select=id&study_id=eq.$DS")"
audit=$(get "audit_log?select=id")
check "audit_log: no access"               "401" "${audit%% *}"

echo "==> Writes with the anon key (all should be refused)"
check "insert prayer refused"   "401" "$(write POST   prayers '{"slug":"rls-test-anon","title":"x","text":"x","source":"x","status":"published"}')"
check "update hymn refused"     "401" "$(write PATCH  "hymns?number=eq.90002" '{"status":"published"}')"
check "delete hymn refused"     "401" "$(write DELETE "hymns?number=eq.90001")"
check "insert audit_log refused" "401" "$(write POST  audit_log '{"actor":"anon","action":"x","table_name":"x"}')"

# Belt and braces: confirm through the privileged connection that nothing changed.
echo "==> Database unchanged after the write attempts"
state=$(npx supabase db query --linked "select
  (select count(*) from public.prayers where slug = 'rls-test-anon') as anon_prayer,
  (select status from public.hymns where number = 90002) as draft_status,
  (select count(*) from public.hymns where number = 90001) as pub_hymn" 2>/dev/null \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["rows"][0]; print(r["anon_prayer"], r["draft_status"], r["pub_hymn"])')
check "no anon prayer, draft still draft, hymn not deleted" "0 draft 1" "$state"

echo
echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
