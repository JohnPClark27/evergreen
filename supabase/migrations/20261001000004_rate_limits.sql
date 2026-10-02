-- Phase 5: rate limiting for the youversion Edge Function.
--
-- Hosted Edge Functions don't keep memory between requests (each request can land on a
-- fresh instance), so counters live here. The function calls youversion_rate_hit() with
-- the anon key. Keys are SHA-256 hashes computed inside the function from a secret + the
-- client IP, so no IPs are stored and nobody can guess (or exhaust) another client's key.

create table public.rate_limits (
  key          text        not null check (length(key) <= 64),
  window_start timestamptz not null,               -- start of the one-minute window
  count        int         not null default 0,
  primary key (key, window_start)
);

-- No direct access for anyone but the service role; only the function below touches it.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Count one request against each key (e.g. [client, everyone]) in the current minute.
-- Returns the requests left for the FIRST key, or -1 if any key is over its limit
-- (in which case nothing is counted).
create function public.youversion_rate_hit(p_keys text[], p_limits int[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := date_trunc('minute', now());
  n int := coalesce(array_length(p_keys, 1), 0);
  used int;
  left_first int;
begin
  -- Keep calls small and well-formed (this function is callable with the anon key).
  if n = 0 or n > 2 or n <> coalesce(array_length(p_limits, 1), 0) then
    raise exception 'expected 1-2 keys with matching limits';
  end if;

  for i in 1..n loop
    select r.count into used from public.rate_limits r where r.key = p_keys[i] and r.window_start = w;
    if coalesce(used, 0) >= p_limits[i] then
      return -1;
    end if;
  end loop;

  for i in 1..n loop
    insert into public.rate_limits as r (key, window_start, count) values (p_keys[i], w, 1)
    on conflict (key, window_start) do update set count = r.count + 1
    returning p_limits[i] - r.count into used;
    if i = 1 then
      left_first := used;
    end if;
  end loop;

  -- Old windows are useless: tidy up as we go (cheap, indexed by primary key).
  delete from public.rate_limits where window_start < w - interval '5 minutes';
  return left_first;
end;
$$;

revoke all on function public.youversion_rate_hit(text[], int[]) from public, authenticated;
grant execute on function public.youversion_rate_hit(text[], int[]) to anon;
