-- Phase 1: content schema for Hymnal Reader v2.
-- RLS policies and grants live in the next migration (..._rls.sql).

-- ---------------------------------------------------------------------------
-- Shared bits
-- ---------------------------------------------------------------------------

-- Moderation workflow for every piece of content. Only 'published' is public.
create type public.content_status as enum ('draft', 'approved', 'published', 'archived');

-- Keeps updated_at current on every UPDATE (attached to tables below).
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hymns (one row per Open Hymnal ABC file, i.e. per text + tune)
-- ---------------------------------------------------------------------------

create table public.hymns (
  id              bigint generated always as identity primary key,
  number          int  not null unique,          -- 1..N by sorted source path (matches v1 ids)
  source_file     text not null unique,          -- e.g. Amazing_Grace/Amazing_Grace-New_Britain.abc (importer upsert key)
  title           text not null,
  tune            text,
  first_line      text,
  meter           text,                          -- %OHMETRICAL, e.g. '8 6 8 6'
  stanza_count    int check (stanza_count >= 0),
  abc_path        text,                          -- object keys in the hymn-abc / hymn-audio / hymn-timings buckets
  audio_path      text,
  timing_path     text,
  file_hashes     jsonb not null default '{}',   -- {abc, audio, timing} sha256, so re-imports skip unchanged files
  timing_verified boolean not null default false,
  is_familiar     boolean not null default false,
  status          public.content_status not null default 'draft',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger hymns_updated_at before update on public.hymns
  for each row execute function public.set_updated_at();

-- Scripture a hymn is based on. book is a USFM code (PSA, JHN, ...).
-- verse_start NULL = the whole chapter.
create table public.hymn_scripture_refs (
  id          bigint generated always as identity primary key,
  hymn_id     bigint not null references public.hymns (id) on delete cascade,
  book        text not null check (book ~ '^[1-3A-Z][A-Z0-9]{2}$'),
  chapter     int  not null check (chapter > 0),
  verse_start int  check (verse_start > 0),
  verse_end   int  check (verse_end > 0),
  check (verse_end is null or verse_start is not null)
);

create index hymn_scripture_refs_hymn_id_idx on public.hymn_scripture_refs (hymn_id);
create index hymn_scripture_refs_book_chapter_idx on public.hymn_scripture_refs (book, chapter);

create table public.topics (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create table public.hymn_topics (
  hymn_id  bigint not null references public.hymns (id) on delete cascade,
  topic_id bigint not null references public.topics (id) on delete cascade,
  stanzas  text,                                 -- e.g. '3,4'; NULL = whole hymn
  primary key (hymn_id, topic_id)
);

create index hymn_topics_topic_id_idx on public.hymn_topics (topic_id);

-- ---------------------------------------------------------------------------
-- Prayers (Open Prayer Book, or added in the admin app with a source)
-- ---------------------------------------------------------------------------

create table public.prayers (
  id          bigint generated always as identity primary key,
  slug        text not null unique,
  title       text not null,
  text        text not null,
  source      text not null check (length(trim(source)) > 0),  -- required: where the text came from
  section     text,                                            -- e.g. 'Morning Prayer'
  attribution text,                                            -- e.g. 'Book of Common Prayer, 1662'
  status      public.content_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger prayers_updated_at before update on public.prayers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Studies (one session: hymn -> passage -> prayer) and plans
-- ---------------------------------------------------------------------------

create table public.studies (
  id          bigint generated always as identity primary key,
  title       text not null,
  hymn_id     bigint references public.hymns (id),
  -- Passage reference only. Verse TEXT is never stored; it comes from YouVersion at runtime.
  book        text not null check (book ~ '^[1-3A-Z][A-Z0-9]{2}$'),
  chapter     int  not null check (chapter > 0),
  verse_start int  not null check (verse_start > 0),
  verse_end   int  not null,
  prayer_id   bigint references public.prayers (id),
  aide_note   text check (length(aide_note) <= 280),
  status      public.content_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (verse_end >= verse_start),
  -- Drafts may be half-built, but a published study must be complete.
  check (status <> 'published' or (hymn_id is not null and prayer_id is not null))
);

create index studies_hymn_id_idx on public.studies (hymn_id);
create index studies_prayer_id_idx on public.studies (prayer_id);

create trigger studies_updated_at before update on public.studies
  for each row execute function public.set_updated_at();

create table public.plans (
  id          bigint generated always as identity primary key,
  title       text not null,
  description text,
  status      public.content_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

create table public.plan_days (
  id         bigint generated always as identity primary key,
  plan_id    bigint not null references public.plans (id) on delete cascade,
  day_number int    not null check (day_number > 0),
  study_id   bigint not null references public.studies (id),
  unique (plan_id, day_number)                   -- also serves as the plan_id index
);

create index plan_days_study_id_idx on public.plan_days (study_id);

-- ---------------------------------------------------------------------------
-- Audit log (written by the admin app's data-access module; never public)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      text not null,                      -- OS username running the admin app
  action     text not null,                      -- insert / update / delete / status
  table_name text not null,
  row_id     text,
  before     jsonb,
  after      jsonb
);

create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_row_idx on public.audit_log (table_name, row_id);
