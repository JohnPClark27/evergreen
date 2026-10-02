-- Phase 1: Row Level Security.
--
-- The public app uses the anon/publishable key and may only READ published content.
-- The admin app uses the service role key, which bypasses RLS entirely.
-- 'authenticated' gets the same read-only rules as anon (there are no user accounts,
-- but this closes the door if Auth sign-ups were ever switched on).

-- ---------------------------------------------------------------------------
-- 1. Grants: start from nothing, then allow SELECT on public content only.
--    (Supabase grants everything to anon/authenticated by default. RLS would
--    still block writes, but revoking them too gives a second lock.)
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

grant select on
  public.hymns, public.hymn_scripture_refs, public.topics, public.hymn_topics,
  public.prayers, public.studies, public.plans, public.plan_days
to anon, authenticated;
-- audit_log: no grants at all.

-- ---------------------------------------------------------------------------
-- 2. Turn RLS on everywhere (a table with RLS and no policy returns nothing).
-- ---------------------------------------------------------------------------

alter table public.hymns               enable row level security;
alter table public.hymn_scripture_refs enable row level security;
alter table public.topics              enable row level security;
alter table public.hymn_topics         enable row level security;
alter table public.prayers             enable row level security;
alter table public.studies             enable row level security;
alter table public.plans               enable row level security;
alter table public.plan_days           enable row level security;
alter table public.audit_log           enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Read policies. No insert/update/delete policies exist for anyone but the
--    service role, so all public writes are denied.
-- ---------------------------------------------------------------------------

-- Content tables: published rows only.
create policy "public reads published hymns" on public.hymns
  for select to anon, authenticated using (status = 'published');

create policy "public reads published prayers" on public.prayers
  for select to anon, authenticated using (status = 'published');

create policy "public reads published studies" on public.studies
  for select to anon, authenticated using (status = 'published');

create policy "public reads published plans" on public.plans
  for select to anon, authenticated using (status = 'published');

-- Join tables: only when the parent is published.
create policy "public reads refs of published hymns" on public.hymn_scripture_refs
  for select to anon, authenticated
  using (exists (select 1 from public.hymns h
                 where h.id = hymn_id and h.status = 'published'));

create policy "public reads topics of published hymns" on public.hymn_topics
  for select to anon, authenticated
  using (exists (select 1 from public.hymns h
                 where h.id = hymn_id and h.status = 'published'));

-- A topic name is visible once at least one published hymn uses it.
create policy "public reads topics in use" on public.topics
  for select to anon, authenticated
  using (exists (select 1 from public.hymn_topics ht
                 join public.hymns h on h.id = ht.hymn_id
                 where ht.topic_id = topics.id and h.status = 'published'));

-- A plan day needs both its plan and its study to be published.
create policy "public reads days of published plans" on public.plan_days
  for select to anon, authenticated
  using (exists (select 1 from public.plans p
                 where p.id = plan_id and p.status = 'published')
         and exists (select 1 from public.studies s
                     where s.id = study_id and s.status = 'published'));

-- audit_log: intentionally no policies.
