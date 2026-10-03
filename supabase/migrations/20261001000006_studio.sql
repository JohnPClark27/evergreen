-- Studio: signed-in authors build study plans out of "modules" (hymn, scripture, prayer,
-- note, quiz, …); an admin approves them before tablets can see them.
--
-- ADDITIVE ONLY. The live tablet app (main) still reads plans / plan_days / studies, so those
-- tables are left untouched. The new model lives in study_plans + study_plan_items.

-- ---------------------------------------------------------------------------
-- 1. Profiles: one row per signed-in person (created automatically on sign-up)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (length(display_name) <= 80),
  role         text not null default 'author' check (role in ('author', 'admin')),
  created_at   timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- Is the signed-in person an admin? (security definer so policies can call it without
-- recursing into profiles' own RLS)
create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- 2. Study plans and their modules
-- ---------------------------------------------------------------------------

create table public.study_plans (
  id           bigint generated always as identity primary key,
  owner_id     uuid references public.profiles (id) on delete set null default auth.uid(),
  title        text not null check (length(trim(title)) between 1 and 120),
  description  text check (length(description) <= 500),
  status       public.content_status not null default 'draft',
  review_note  text check (length(review_note) <= 500),   -- admin's note when sending back
  submitted_at timestamptz,
  reviewed_at  timestamptz,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index study_plans_owner_idx on public.study_plans (owner_id);
create index study_plans_status_idx on public.study_plans (status);
create trigger study_plans_updated_at before update on public.study_plans
  for each row execute function public.set_updated_at();

-- Content-integrity rules the database enforces for the core modules (the web app also
-- validates every module, but these are the ones that must never be bypassed):
--   scripture: a REFERENCE only (book/chapter/start/end), never verse text
--   prayer:    only a prayer from the library (prayer_id), never typed-in prayer text
--   hymn:      must point at a hymn
-- Other module types (note, quiz, games, future ones) are checked by the app.
create function public.module_config_ok(t text, c jsonb)
returns boolean language sql immutable as $$
  select case t
    when 'scripture' then (c - array['book', 'chapter', 'start', 'end']) = '{}'::jsonb
                          and jsonb_typeof(c -> 'book') = 'string'
                          and jsonb_typeof(c -> 'chapter') = 'number'
    when 'prayer'    then (c - array['prayer_id']) = '{}'::jsonb
                          and jsonb_typeof(c -> 'prayer_id') = 'number'
    when 'hymn'      then jsonb_typeof(c -> 'hymn_id') = 'number'
    else true
  end;
$$;

create table public.study_plan_items (
  id          bigint generated always as identity primary key,
  plan_id     bigint not null references public.study_plans (id) on delete cascade,
  position    int    not null check (position >= 0),
  module_type text   not null check (module_type ~ '^[a-z][a-z0-9_-]{1,30}$'),
  config      jsonb  not null default '{}'
              check (jsonb_typeof(config) = 'object' and pg_column_size(config) < 20000),
  unique (plan_id, position),
  check (public.module_config_ok(module_type, config))
);

-- ---------------------------------------------------------------------------
-- 3. Who may change a plan's status (authors submit; only admins publish)
-- ---------------------------------------------------------------------------

create function public.study_plans_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Service role / SQL editor (no signed-in user): trusted, allow anything.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    if new.status is distinct from old.status and old.status = 'pending' then
      new.reviewed_at := now();
      new.reviewed_by := auth.uid();
    end if;
    return new;
  end if;

  -- Authors from here on.
  if new.owner_id is distinct from old.owner_id
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.review_note is distinct from old.review_note then
    raise exception 'Only an admin can change that.';
  end if;
  if new.status in ('published', 'approved') and new.status is distinct from old.status then
    raise exception 'Plans are published by an admin after review. Submit it for review instead.';
  end if;
  -- Allowed moves: draft → pending (submit), pending → draft (withdraw),
  -- published → draft (take back to edit), anything ↔ archived.
  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status = 'pending')
    or (old.status = 'pending' and new.status = 'draft')
    or (old.status = 'published' and new.status = 'draft')
    or new.status = 'archived'
    or (old.status = 'archived' and new.status = 'draft')) then
    raise exception 'A plan can''t go from % to %.', old.status, new.status;
  end if;
  -- Title/description edits only while it's a draft.
  if old.status <> 'draft' and new.status <> 'draft'
     and (new.title is distinct from old.title or new.description is distinct from old.description) then
    raise exception 'Move the plan back to draft to edit it.';
  end if;
  if new.status = 'pending' and old.status <> 'pending' then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

create trigger study_plans_guard before update on public.study_plans
  for each row execute function public.study_plans_guard();

-- New plans always start as a draft owned by whoever creates them.
create function public.study_plans_on_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.owner_id := auth.uid();
    new.status := 'draft';
  end if;
  return new;
end;
$$;
create trigger study_plans_on_insert before insert on public.study_plans
  for each row execute function public.study_plans_on_insert();

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.study_plans      enable row level security;
alter table public.study_plan_items enable row level security;

revoke all on public.profiles, public.study_plans, public.study_plan_items from anon, authenticated;

-- Profiles: you see yourself; admins see everyone. You may only change your display name.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "read own profile or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "update own display name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Study plans: tablets (anon) see published ones; authors see and edit their own; admins all.
grant select on public.study_plans, public.study_plan_items to anon, authenticated;
grant insert, update, delete on public.study_plans, public.study_plan_items to authenticated;

create policy "public reads published plans" on public.study_plans for select to anon, authenticated
  using (status = 'published');
create policy "authors read own plans" on public.study_plans for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());
create policy "authors create plans" on public.study_plans for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());
create policy "authors update own plans" on public.study_plans for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy "authors delete own drafts" on public.study_plans for delete to authenticated
  using ((owner_id = auth.uid() and status in ('draft', 'archived')) or public.is_admin());

create policy "read items of visible plans" on public.study_plan_items for select to anon, authenticated
  using (exists (select 1 from public.study_plans p where p.id = plan_id
                 and (p.status = 'published' or p.owner_id = auth.uid() or public.is_admin())));
create policy "edit items of own drafts" on public.study_plan_items for all to authenticated
  using (exists (select 1 from public.study_plans p where p.id = plan_id
                 and ((p.owner_id = auth.uid() and p.status = 'draft') or public.is_admin())))
  with check (exists (select 1 from public.study_plans p where p.id = plan_id
                 and ((p.owner_id = auth.uid() and p.status = 'draft') or public.is_admin())));

-- Admins manage the hymn and prayer libraries from the Studio (replacing the Python app).
create policy "admins read all hymns" on public.hymns for select to authenticated using (public.is_admin());
grant update (status, is_familiar, title, first_line, notes) on public.hymns to authenticated;
create policy "admins update hymns" on public.hymns for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read all prayers" on public.prayers for select to authenticated using (public.is_admin());
grant insert (slug, title, text, source, section, attribution, status),
      update (slug, title, text, source, section, attribution, status) on public.prayers to authenticated;
grant usage on sequence public.prayers_id_seq to authenticated;
create policy "admins add prayers" on public.prayers for insert to authenticated with check (public.is_admin());
create policy "admins update prayers" on public.prayers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins read scripture refs" on public.hymn_scripture_refs for select to authenticated
  using (public.is_admin());

grant select on public.audit_log to authenticated;
create policy "admins read audit log" on public.audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Functions the Studio calls
-- ---------------------------------------------------------------------------

-- Save a plan and ALL its modules in one transaction (RLS still applies: security invoker).
-- p_items: [{ "type": "hymn", "config": {...} }, ...] in order. Returns the plan id.
create function public.save_study_plan(p_id bigint, p_title text, p_description text, p_items jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  v_plan_id bigint := p_id;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then
    raise exception 'A plan holds up to 60 modules.';
  end if;
  if v_plan_id is null then
    insert into public.study_plans (title, description) values (p_title, p_description)
    returning id into v_plan_id;
  else
    update public.study_plans set title = p_title, description = p_description where id = v_plan_id;
    if not found then raise exception 'Plan not found (or not yours).'; end if;
    delete from public.study_plan_items i where i.plan_id = v_plan_id;
  end if;
  insert into public.study_plan_items (plan_id, position, module_type, config)
  select v_plan_id, (e.ord - 1)::int, e.item ->> 'type', coalesce(e.item -> 'config', '{}'::jsonb)
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);
  return v_plan_id;
end;
$$;

-- What stops a plan from being published: empty, or using hymns/prayers that aren't published.
create function public.study_plan_problems(p_id bigint)
returns text[] language sql stable security invoker set search_path = '' as $$
  select array(
    select 'The plan has no modules.'
      where not exists (select 1 from public.study_plan_items i where i.plan_id = p_id)
    union all
    select format('Module %s: hymn #%s isn''t published', i.position + 1, coalesce(h.number::text, i.config ->> 'hymn_id'))
      from public.study_plan_items i left join public.hymns h on h.id = (i.config ->> 'hymn_id')::bigint
      where i.plan_id = p_id and i.config ? 'hymn_id' and (h.id is null or h.status <> 'published')
    union all
    select format('Module %s: prayer "%s" isn''t published', i.position + 1, coalesce(pr.title, i.config ->> 'prayer_id'))
      from public.study_plan_items i left join public.prayers pr on pr.id = (i.config ->> 'prayer_id')::bigint
      where i.plan_id = p_id and i.module_type = 'prayer' and (pr.id is null or pr.status <> 'published')
  );
$$;

-- Admin decision on a submitted plan. Approve publishes it (only if nothing blocks it);
-- send back returns it to the author as a draft with a note.
create function public.review_study_plan(p_id bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  problems text[];
begin
  if not public.is_admin() then raise exception 'Only an admin can review plans.'; end if;
  if p_approve then
    problems := public.study_plan_problems(p_id);
    if cardinality(problems) > 0 then
      raise exception 'Can''t publish yet: %', array_to_string(problems, '; ');
    end if;
  end if;
  update public.study_plans
     set status = case when p_approve then 'published'::public.content_status else 'draft'::public.content_status end,
         review_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id and status = 'pending';
  if not found then raise exception 'That plan isn''t waiting for review.'; end if;
end;
$$;

-- Admin: everyone who has signed in (emails come from auth.users, which the API can't read).
create function public.admin_list_users()
returns table (id uuid, email text, display_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can list users.'; end if;
  return query select p.id, u.email::text, p.display_name, p.role, p.created_at
    from public.profiles p join auth.users u on u.id = p.id order by p.created_at;
end;
$$;

-- Admin: make someone an admin or an author (not yourself, so there's always one admin left).
create function public.set_user_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only an admin can change roles.'; end if;
  if p_user = auth.uid() then raise exception 'You can''t change your own role.'; end if;
  if p_role not in ('author', 'admin') then raise exception 'Unknown role %', p_role; end if;
  update public.profiles set role = p_role where id = p_user;
end;
$$;

revoke all on function public.save_study_plan(bigint, text, text, jsonb),
                       public.study_plan_problems(bigint),
                       public.review_study_plan(bigint, boolean, text),
                       public.admin_list_users(),
                       public.set_user_role(uuid, text),
                       public.is_admin() from public, anon;
grant execute on function public.save_study_plan(bigint, text, text, jsonb),
                          public.study_plan_problems(bigint),
                          public.review_study_plan(bigint, boolean, text),
                          public.admin_list_users(),
                          public.set_user_role(uuid, text),
                          public.is_admin() to authenticated;
-- RLS policies for anon call is_admin() too (it returns false for them).
grant execute on function public.is_admin() to anon;

-- ---------------------------------------------------------------------------
-- 6. Audit log: every change a signed-in person makes, with their email
-- ---------------------------------------------------------------------------
-- (The service-role pipeline is skipped: it writes its own one-line summary per run.)

create function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who text := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then return null; end if;
  insert into public.audit_log (actor, action, table_name, row_id, before, after)
  values (who, lower(tg_op), tg_table_name,
          coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end;
$$;

-- Module lists are rewritten as a whole on each save, so log them per statement (one row
-- with all the modules) instead of one row per module.
create function public.audit_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who text := coalesce(auth.jwt() ->> 'email', auth.uid()::text);
  rows jsonb;
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'INSERT' then
    select jsonb_agg(to_jsonb(n) order by n.plan_id, n.position) into rows from new_rows n;
  else
    select jsonb_agg(to_jsonb(o) order by o.plan_id, o.position) into rows from old_rows o;
  end if;
  if rows is null then return null; end if;
  insert into public.audit_log (actor, action, table_name, row_id, before, after)
  values (who, lower(tg_op), 'study_plan_items', rows -> 0 ->> 'plan_id',
          case when tg_op = 'DELETE' then jsonb_build_object('items', rows) end,
          case when tg_op = 'INSERT' then jsonb_build_object('items', rows) end);
  return null;
end;
$$;

create trigger audit_study_plans after insert or update or delete on public.study_plans
  for each row execute function public.audit_row();
create trigger audit_study_plan_items_ins after insert on public.study_plan_items
  referencing new table as new_rows for each statement execute function public.audit_items();
create trigger audit_study_plan_items_del after delete on public.study_plan_items
  referencing old table as old_rows for each statement execute function public.audit_items();
create trigger audit_hymns after update on public.hymns
  for each row execute function public.audit_row();
create trigger audit_prayers after insert or update on public.prayers
  for each row execute function public.audit_row();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_row();

revoke all on function public.audit_row(), public.audit_items(), public.handle_new_user(),
                       public.study_plans_guard(), public.study_plans_on_insert()
  from public, anon, authenticated;
