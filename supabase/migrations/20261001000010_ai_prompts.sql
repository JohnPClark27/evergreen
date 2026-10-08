-- AI prompts that admins can edit in the Studio ("AI prompt" page).
--
-- One row per prompt; today only 'today' ("Chosen for you": the verse of the day after
-- "How are you feeling today?"). Admins edit the GUIDANCE (tone, what to prefer or avoid)
-- and the EXAMPLES (themes and example passages per feeling). The safety rules (a reference
-- only, 1-3 verses, never verse text, the reply format) are fixed in the curate Edge Function
-- and can't be edited here.
--
-- Read: anyone (the curate function reads it with the publishable key; nothing secret).
-- Write: admins only (RLS). Every change is in the audit log with the admin's email.

-- Examples: exactly the five feelings (levels 1-5, once each), each with 0-6 short themes
-- and 1-8 references "BOOK.chapter.start-end" of 1-3 verses. References only, never text.
create function public.ai_examples_ok(e jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  ref text;
  m text[];
  levels int[] := '{}';
begin
  if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 5 then return false; end if;
  for item in select * from jsonb_array_elements(e) loop
    if jsonb_typeof(item) <> 'object' or (item - array['level', 'themes', 'refs']) <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(item -> 'level') <> 'number' or (item ->> 'level')::int not between 1 and 5 then return false; end if;
    levels := levels || (item ->> 'level')::int;
    if jsonb_typeof(item -> 'themes') <> 'array' or jsonb_array_length(item -> 'themes') > 6 then return false; end if;
    if exists (select 1 from jsonb_array_elements(item -> 'themes') t
               where jsonb_typeof(t) <> 'string' or length(t #>> '{}') not between 1 and 40) then return false; end if;
    if jsonb_typeof(item -> 'refs') <> 'array' or jsonb_array_length(item -> 'refs') not between 1 and 8 then return false; end if;
    for ref in select r #>> '{}' from jsonb_array_elements(item -> 'refs') r loop
      m := regexp_match(coalesce(ref, ''), '^([1-3A-Z]{3})\.(\d{1,3})\.(\d{1,3})-(\d{1,3})$');
      if m is null or m[4]::int < m[3]::int or m[4]::int - m[3]::int > 2 or m[3]::int < 1 then return false; end if;
    end loop;
  end loop;
  return (select count(distinct x) = 5 from unnest(levels) x);
end;
$$;

create table public.ai_prompts (
  id          text primary key check (id ~ '^[a-z_]{2,30}$'),
  guidance    text not null check (length(guidance) between 20 and 4000),
  examples    jsonb not null check (public.ai_examples_ok(examples)),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Who changed it last (shown in the Studio), and when.
create function public.ai_prompts_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end;
$$;
create trigger ai_prompts_stamp before insert or update on public.ai_prompts
  for each row execute function public.ai_prompts_stamp();
create trigger audit_ai_prompts after insert or update on public.ai_prompts
  for each row execute function public.audit_row();

alter table public.ai_prompts enable row level security;
grant select on public.ai_prompts to anon, authenticated;
grant insert, update on public.ai_prompts to authenticated;
create policy "anyone reads ai prompts" on public.ai_prompts for select to anon, authenticated using (true);
create policy "admins add ai prompts" on public.ai_prompts for insert to authenticated with check (public.is_admin());
create policy "admins edit ai prompts" on public.ai_prompts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The starting prompt: the same text and examples as supabase/functions/curate/prompt.ts
-- (the function's built-in default if this row is ever missing). Example passages are a
-- draft for a pastor to review.
insert into public.ai_prompts (id, guidance, examples, updated_by) values ('today',
  'You help choose a short Bible passage and four activities for an older adult in a care home, using a large-print tablet. '
  || 'They just told us how they feel. Choose a verse of the day that is gentle, well known, and fitting for that feeling. '
  || 'Avoid passages about judgment, punishment, death or illness, and anything that could frighten or confuse. '
  || 'Prefer Psalms, the Gospels and familiar promises. Use the examples as a guide to tone and theme: '
  || 'you may choose one of them or another passage like them. Choose activities connected to the verse or the feeling.',
  '[
    {"level": 1, "themes": ["joy", "praise", "thanksgiving"], "refs": ["PSA.100.1-2", "PHP.4.4-5", "PSA.118.24-24", "PSA.103.1-2"]},
    {"level": 2, "themes": ["gratitude", "God''s care", "faithfulness"], "refs": ["PSA.23.1-3", "LAM.3.22-23", "PSA.136.1-1", "PSA.121.1-2"]},
    {"level": 3, "themes": ["steadiness", "quiet trust", "daily strength"], "refs": ["PSA.121.7-8", "ISA.40.29-31", "PSA.46.10-10", "MAT.6.34-34"]},
    {"level": 4, "themes": ["rest", "God''s nearness", "strength in weakness"], "refs": ["PSA.46.1-1", "MAT.11.28-29", "ISA.41.10-10", "PSA.62.5-6"]},
    {"level": 5, "themes": ["comfort", "not being alone", "hope"], "refs": ["PSA.34.18-18", "ISA.43.1-2", "JHN.14.1-1", "2CO.1.3-4", "PSA.42.11-11"]}
  ]'::jsonb,
  'migration');
