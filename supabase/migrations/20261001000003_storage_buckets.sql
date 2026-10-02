-- Phase 2: Storage buckets for hymn files.
--
-- Public buckets: files are served from public URLs with a long cache-control
-- (set per upload by pipeline/import_hymns.py). Everything in them is public-domain
-- Open Hymnal material. Only the service role (pipeline/admin) can upload, change,
-- delete, or list objects: there are no storage.objects policies for anon.
--
-- The size limits are a guard rail under the Free tier's 50 MB per-file cap.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('hymn-abc',     'hymn-abc',     true,  1048576, array['text/plain']),        --  1 MB
  ('hymn-audio',   'hymn-audio',   true, 20971520, array['audio/mpeg']),        -- 20 MB
  ('hymn-timings', 'hymn-timings', true,  5242880, array['application/json'])   --  5 MB
on conflict (id) do nothing;
