-- 2026-11-18: the AI "Paint it" feature was retired (see 004_reskin.sql). Its queue table, functions and
-- stored images (bb-maps/reskins/...) were removed; nothing in the app used them any more.
drop function if exists public.bb_reskin_claim();
drop function if exists public.bb_reskin_enqueue(text, text, text, text, text, text, jsonb, integer, integer, text, integer, integer, integer);
drop function if exists public.bb_reskin_finish(uuid, text, text, text);
drop table if exists public.bb_reskin_jobs;
