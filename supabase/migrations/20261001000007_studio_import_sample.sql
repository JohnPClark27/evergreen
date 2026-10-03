-- Studio: turn each day of the published "Sample — 12 Days" plan into its own published
-- study plan (hymn → scripture → prayer modules), so tablets have plans to choose from.
-- Runs once (skips if any study plan exists). Old tables are left as they are.
do $$
declare
  d record;
  new_id bigint;
begin
  if exists (select 1 from public.study_plans) then
    return;
  end if;
  for d in
    select pd.day_number, s.*, p.title as plan_title
    from public.plan_days pd
    join public.plans p on p.id = pd.plan_id and p.status = 'published'
    join public.studies s on s.id = pd.study_id and s.status = 'published'
    order by p.id, pd.day_number
  loop
    insert into public.study_plans (owner_id, title, description, status)
    values (null,
            replace(d.title, 'Psalms ', 'Psalm '),          -- "Psalm 23", as everywhere else
            format('Day %s of "%s": a hymn, a short passage, and a prayer.', d.day_number, d.plan_title),
            'published')
    returning id into new_id;
    insert into public.study_plan_items (plan_id, position, module_type, config) values
      (new_id, 0, 'hymn', jsonb_build_object('hymn_id', d.hymn_id)),
      (new_id, 1, 'scripture', jsonb_build_object('book', d.book, 'chapter', d.chapter,
                                                  'start', d.verse_start, 'end', d.verse_end)),
      (new_id, 2, 'prayer', jsonb_build_object('prayer_id', d.prayer_id));
  end loop;
end;
$$;
