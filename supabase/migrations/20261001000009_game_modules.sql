-- Game modules (word-search, crossword, trivia) store a Scripture REFERENCE and a difficulty,
-- never verse text: the tablet fetches the passage live and builds the game in memory.
-- Same rule as the scripture module, enforced the same way (module_config_ok).
create or replace function public.module_config_ok(t text, c jsonb)
returns boolean language sql immutable as $$
  select case
    when t = 'scripture' then (c - array['book', 'chapter', 'start', 'end']) = '{}'::jsonb
                          and jsonb_typeof(c -> 'book') = 'string'
                          and jsonb_typeof(c -> 'chapter') = 'number'
    when t = 'prayer'    then (c - array['prayer_id']) = '{}'::jsonb
                          and jsonb_typeof(c -> 'prayer_id') = 'number'
    when t = 'hymn'      then jsonb_typeof(c -> 'hymn_id') = 'number'
    when t in ('word-search', 'crossword', 'trivia') then (c - array['book', 'chapter', 'start', 'end', 'difficulty']) = '{}'::jsonb
                          and jsonb_typeof(c -> 'book') = 'string'
                          and jsonb_typeof(c -> 'chapter') = 'number'
                          and coalesce(c ->> 'difficulty', 'easy') in ('easy', 'normal')
    else true
  end;
$$;
