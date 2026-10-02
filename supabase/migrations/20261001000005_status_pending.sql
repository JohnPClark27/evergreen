-- Studio: a 'pending' status for study plans an author has submitted for review.
-- (Its own migration: Postgres can't use a new enum value in the transaction that adds it.)
-- Additive only: existing rows and the live app are unaffected.
alter type public.content_status add value if not exists 'pending' before 'published';
