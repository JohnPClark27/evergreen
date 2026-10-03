-- Studio: a study PLAN now holds several STUDIES, and each study holds its modules.
--
--   study_plans (title, owner, status, review)          ← published by a pastor, approved by an admin
--     └─ plan_studies (position, title)                 ← "Study 1", "Study 2", …
--          └─ study_plan_items (position, module_type, config)
--
-- Review and publishing stay at the PLAN level (a plan is approved as a whole).
-- Only the studio branch uses these tables; main/production still reads plans/plan_days/studies.

-- ---------------------------------------------------------------------------
-- 1. Studies inside a plan
-- ---------------------------------------------------------------------------

create table public.plan_studies (
  id       bigint generated always as identity primary key,
  plan_id  bigint not null references public.study_plans (id) on delete cascade,
  position int    not null check (position >= 0),
  title    text   not null check (length(trim(title)) between 1 and 120),
  unique (plan_id, position),
  unique (id, plan_id)            -- lets a module point at (study, plan) together, below
);

-- Every existing plan gets one study holding its current modules (same title as the plan).
insert into public.plan_studies (plan_id, position, title)
select id, 0, title from public.study_plans;

alter table public.study_plan_items add column study_id bigint;
update public.study_plan_items i
   set study_id = s.id
  from public.plan_studies s
 where s.plan_id = i.plan_id;
alter table public.study_plan_items alter column study_id set not null;

-- A module belongs to a study, and that study must be in the same plan (keeps plan_id,
-- which the security rules use, honest).
alter table public.study_plan_items
  add constraint study_plan_items_study_fk
  foreign key (study_id, plan_id) references public.plan_studies (id, plan_id) on delete cascade;
-- Module order is now per study, not per plan.
alter table public.study_plan_items drop constraint study_plan_items_plan_id_position_key;
alter table public.study_plan_items add constraint study_plan_items_study_position_key unique (study_id, position);
create index study_plan_items_plan_idx on public.study_plan_items (plan_id);

-- ---------------------------------------------------------------------------
-- 2. Combine the 12 imported days into ONE plan "Sample — 12 Days" (a draft for the
--    owner to review and publish). The 12 one-study plans are ARCHIVED, not deleted.
-- ---------------------------------------------------------------------------

do $$
declare
  new_plan bigint;
  new_study bigint;
  d record;
begin
  if exists (select 1 from public.study_plans where title = 'Sample — 12 Days') then
    return;
  end if;
  if not exists (select 1 from public.study_plans
                 where owner_id is null and description like 'Day % of "Sample — 12 Days"%') then
    return;
  end if;
  insert into public.study_plans (owner_id, title, description, status)
  values (null, 'Sample — 12 Days',
          'Twelve short studies. Each has a familiar hymn, a short passage, and a prayer.', 'draft')
  returning id into new_plan;

  for d in
    select p.id, p.title,
           row_number() over (order by (regexp_match(p.description, '^Day (\d+) of'))[1]::int) - 1 as pos
    from public.study_plans p
    where p.owner_id is null and p.description like 'Day % of "Sample — 12 Days"%'
    order by pos
  loop
    insert into public.plan_studies (plan_id, position, title)
    values (new_plan, d.pos, d.title)
    returning id into new_study;
    insert into public.study_plan_items (plan_id, study_id, position, module_type, config)
    select new_plan, new_study, i.position, i.module_type, i.config
      from public.study_plan_items i
     where i.plan_id = d.id
     order by i.position;
    update public.study_plans set status = 'archived' where id = d.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Security: studies follow their plan (same rules as modules)
-- ---------------------------------------------------------------------------

alter table public.plan_studies enable row level security;
revoke all on public.plan_studies from anon, authenticated;
grant select on public.plan_studies to anon, authenticated;
grant insert, update, delete on public.plan_studies to authenticated;

create policy "read studies of visible plans" on public.plan_studies for select to anon, authenticated
  using (exists (select 1 from public.study_plans p where p.id = plan_id
                 and (p.status = 'published' or p.owner_id = auth.uid() or public.is_admin())));
create policy "edit studies of own drafts" on public.plan_studies for all to authenticated
  using (exists (select 1 from public.study_plans p where p.id = plan_id
                 and ((p.owner_id = auth.uid() and p.status = 'draft') or public.is_admin())))
  with check (exists (select 1 from public.study_plans p where p.id = plan_id
                 and ((p.owner_id = auth.uid() and p.status = 'draft') or public.is_admin())));

-- ---------------------------------------------------------------------------
-- 4. Saving and checking a plan, now with studies
-- ---------------------------------------------------------------------------

-- Save a plan, ALL its studies and ALL their modules in one transaction (RLS applies).
-- p_studies: [{ "title": "Study 1", "items": [{ "type": "hymn", "config": {...} }, ...] }, ...]
drop function public.save_study_plan(bigint, text, text, jsonb);
create function public.save_study_plan(p_id bigint, p_title text, p_description text, p_studies jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  v_plan_id  bigint := p_id;
  v_study_id bigint;
  s record;
begin
  if jsonb_typeof(p_studies) <> 'array' or jsonb_array_length(p_studies) > 60 then
    raise exception 'A plan holds up to 60 studies.';
  end if;
  if v_plan_id is null then
    insert into public.study_plans (title, description) values (p_title, p_description)
    returning id into v_plan_id;
  else
    update public.study_plans set title = p_title, description = p_description where id = v_plan_id;
    if not found then raise exception 'Plan not found (or not yours).'; end if;
    delete from public.plan_studies ps where ps.plan_id = v_plan_id;   -- their modules go too (cascade)
  end if;

  for s in select e.study, e.ord from jsonb_array_elements(p_studies) with ordinality as e(study, ord) loop
    if jsonb_typeof(coalesce(s.study -> 'items', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(s.study -> 'items', '[]'::jsonb)) > 60 then
      raise exception 'A study holds up to 60 modules.';
    end if;
    insert into public.plan_studies (plan_id, position, title)
    values (v_plan_id, (s.ord - 1)::int,
            coalesce(nullif(trim(s.study ->> 'title'), ''), 'Study ' || s.ord))
    returning id into v_study_id;
    insert into public.study_plan_items (plan_id, study_id, position, module_type, config)
    select v_plan_id, v_study_id, (i.ord - 1)::int, i.item ->> 'type', coalesce(i.item -> 'config', '{}'::jsonb)
      from jsonb_array_elements(coalesce(s.study -> 'items', '[]'::jsonb)) with ordinality as i(item, ord);
  end loop;
  return v_plan_id;
end;
$$;

-- What stops a plan from being published: no studies, an empty study, or modules using
-- hymns/prayers that aren't published.
create or replace function public.study_plan_problems(p_id bigint)
returns text[] language sql stable security invoker set search_path = '' as $$
  select array(
    select 'The plan has no studies.'
      where not exists (select 1 from public.plan_studies s where s.plan_id = p_id)
    union all
    select format('Study %s ("%s") has no modules.', s.position + 1, s.title)
      from public.plan_studies s
     where s.plan_id = p_id
       and not exists (select 1 from public.study_plan_items i where i.study_id = s.id)
    union all
    select format('Study %s, module %s: hymn #%s isn''t published', s.position + 1, i.position + 1,
                  coalesce(h.number::text, i.config ->> 'hymn_id'))
      from public.study_plan_items i
      join public.plan_studies s on s.id = i.study_id
      left join public.hymns h on h.id = (i.config ->> 'hymn_id')::bigint
     where i.plan_id = p_id and i.config ? 'hymn_id' and (h.id is null or h.status <> 'published')
    union all
    select format('Study %s, module %s: prayer "%s" isn''t published', s.position + 1, i.position + 1,
                  coalesce(pr.title, i.config ->> 'prayer_id'))
      from public.study_plan_items i
      join public.plan_studies s on s.id = i.study_id
      left join public.prayers pr on pr.id = (i.config ->> 'prayer_id')::bigint
     where i.plan_id = p_id and i.module_type = 'prayer' and (pr.id is null or pr.status <> 'published')
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Audit: studies and modules are rewritten as a whole on each save, so each is logged
--    once per statement (one row listing them all), with the signed-in person's email.
-- ---------------------------------------------------------------------------

create function public.audit_statement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who text := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  rows jsonb;
begin
  if auth.uid() is null then return null; end if;   -- service role: not a person
  if tg_op = 'INSERT' then
    select jsonb_agg(to_jsonb(n)) into rows from new_rows n;
  else
    select jsonb_agg(to_jsonb(o)) into rows from old_rows o;
  end if;
  if rows is null then return null; end if;
  insert into public.audit_log (actor, action, table_name, row_id, before, after)
  values (who, lower(tg_op), tg_table_name, rows -> 0 ->> 'plan_id',
          case when tg_op = 'DELETE' then jsonb_build_object('rows', rows) end,
          case when tg_op = 'INSERT' then jsonb_build_object('rows', rows) end);
  return null;
end;
$$;
revoke all on function public.audit_statement() from public, anon, authenticated;

create trigger audit_plan_studies_ins after insert on public.plan_studies
  referencing new table as new_rows for each statement execute function public.audit_statement();
create trigger audit_plan_studies_del after delete on public.plan_studies
  referencing old table as old_rows for each statement execute function public.audit_statement();
