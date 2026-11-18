-- RETIRED 2026-11-18: the AI "Paint it" feature was removed (results never matched the layouts). Kept as a record
-- of what exists in the database; nothing in the app reads or writes bb_reskin_jobs any more.
-- AI map reskins: a job queue the Foundry laptop's worker drains (supabase/functions/bb-reskin).
-- Browsers may read job status (no ip_hash); only the edge function (service role) writes.

create table if not exists public.bb_reskin_jobs (
  id          uuid primary key default gen_random_uuid(),
  campaign    text not null,
  bastion_id  text not null,
  floor_name  text not null default '',
  style       text not null default '',
  prompt      text not null default '',
  meta        jsonb not null default '{}'::jsonb,   -- layout seed/sig + pixel transform, for the label overlay
  width       int not null,
  height      int not null,
  status      text not null default 'queued',        -- queued | running | done | failed
  attempts    int not null default 0,
  error       text not null default '',
  control_path text not null default '',
  result_path  text not null default '',
  ip_hash     text not null default '',
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz
);
create index if not exists bb_reskin_jobs_queue_idx on public.bb_reskin_jobs (status, created_at);
create index if not exists bb_reskin_jobs_bastion_idx on public.bb_reskin_jobs (bastion_id, created_at desc);
alter table public.bb_reskin_jobs enable row level security;
revoke all on public.bb_reskin_jobs from anon, authenticated;
grant select (id, campaign, bastion_id, floor_name, style, meta, width, height, status, error, result_path,
  created_at, started_at, finished_at) on public.bb_reskin_jobs to anon, authenticated;
drop policy if exists bb_reskin_read on public.bb_reskin_jobs;
create policy bb_reskin_read on public.bb_reskin_jobs for select to anon, authenticated using (true);

-- enqueue with limits; returns {ok,id} or {ok:false, reason, retry_after_s}
create or replace function public.bb_reskin_enqueue(p_campaign text, p_bastion text, p_ip_hash text, p_floor text,
  p_style text, p_prompt text, p_meta jsonb, p_width int, p_height int, p_control_path text,
  p_ip_per_hour int, p_bastion_per_day int, p_max_queued int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_n int; v_first timestamptz; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('bb_reskin_enqueue'));
  delete from bb_reskin_jobs where created_at < now() - interval '30 days';
  select count(*) into v_n from bb_reskin_jobs where status in ('queued', 'running');
  if v_n >= p_max_queued then return jsonb_build_object('ok', false, 'reason', 'queue', 'retry_after_s', 120); end if;
  select count(*), min(created_at) into v_n, v_first from bb_reskin_jobs
   where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_n >= p_ip_per_hour then
    return jsonb_build_object('ok', false, 'reason', 'ip',
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_first + interval '1 hour' - now())))));
  end if;
  select count(*) into v_n from bb_reskin_jobs where bastion_id = p_bastion and created_at >= v_day;
  if v_n >= p_bastion_per_day then
    return jsonb_build_object('ok', false, 'reason', 'bastion',
      'retry_after_s', ceil(extract(epoch from (v_day + interval '1 day' - now()))));
  end if;
  insert into bb_reskin_jobs (campaign, bastion_id, ip_hash, floor_name, style, prompt, meta, width, height, control_path)
  values (p_campaign, p_bastion, p_ip_hash, left(p_floor, 60), left(p_style, 40), left(p_prompt, 1500), p_meta,
          p_width, p_height, p_control_path)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- worker claims the oldest queued job (or one stuck running > 10 min, up to 3 attempts)
create or replace function public.bb_reskin_claim()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v bb_reskin_jobs;
begin
  update bb_reskin_jobs set status = 'failed', error = 'gave up after 3 attempts', finished_at = now()
   where status = 'running' and started_at < now() - interval '10 minutes' and attempts >= 3;
  select * into v from bb_reskin_jobs
   where status = 'queued' or (status = 'running' and started_at < now() - interval '10 minutes')
   order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update bb_reskin_jobs set status = 'running', started_at = now(), attempts = attempts + 1 where id = v.id;
  return jsonb_build_object('id', v.id, 'prompt', v.prompt, 'style', v.style, 'width', v.width, 'height', v.height,
    'control_path', v.control_path, 'campaign', v.campaign, 'bastion_id', v.bastion_id, 'meta', v.meta);
end $$;

create or replace function public.bb_reskin_finish(p_id uuid, p_status text, p_result_path text, p_error text)
returns void language sql security definer set search_path = public as $$
  update bb_reskin_jobs set status = p_status, result_path = coalesce(p_result_path, ''),
    error = left(coalesce(p_error, ''), 300), finished_at = now()
  where id = p_id and status = 'running';
$$;

revoke all on function public.bb_reskin_enqueue(text, text, text, text, text, text, jsonb, int, int, text, int, int, int) from public, anon, authenticated;
revoke all on function public.bb_reskin_claim() from public, anon, authenticated;
revoke all on function public.bb_reskin_finish(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bb_reskin_enqueue(text, text, text, text, text, text, jsonb, int, int, text, int, int, int) to service_role;
grant execute on function public.bb_reskin_claim() to service_role;
grant execute on function public.bb_reskin_finish(uuid, text, text, text) to service_role;
