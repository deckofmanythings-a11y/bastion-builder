-- AI layout guidance (supabase/functions/bb-layout): rate limits + spend log.
-- Private tables (RLS on, no policies, no anon/authenticated grants). Only the edge function touches them,
-- through SECURITY DEFINER functions that only service_role may execute.

create table if not exists public.bb_ai_calls (
  id          bigint generated always as identity primary key,
  campaign    text not null,
  bastion_id  text not null,
  ip_hash     text not null,
  status      text not null default 'pending',
  model       text not null default '',
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd    numeric(10,5) not null default 0,
  latency_ms  int not null default 0,
  request     text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists bb_ai_calls_created_idx on public.bb_ai_calls (created_at desc);
create index if not exists bb_ai_calls_bastion_idx on public.bb_ai_calls (bastion_id, created_at desc);
create index if not exists bb_ai_calls_ip_idx on public.bb_ai_calls (ip_hash, created_at desc);
alter table public.bb_ai_calls enable row level security;
revoke all on public.bb_ai_calls from anon, authenticated;

-- Admit (or refuse) one call. Serialized with an advisory lock so concurrent calls can't slip past a limit.
-- Returns {ok, id} or {ok:false, reason: budget|ip|bastion|campaign, retry_after_s}.
create or replace function public.bb_ai_admit(p_campaign text, p_bastion text, p_ip_hash text, p_request text,
  p_ip_per_hour int, p_bastion_per_day int, p_campaign_per_day int, p_daily_budget numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_day timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_spend numeric; v_n int; v_first timestamptz; v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('bb_ai_admit'));
  delete from bb_ai_calls where created_at < now() - interval '60 days';
  select coalesce(sum(cost_usd), 0) into v_spend from bb_ai_calls where created_at >= v_day;
  if v_spend >= p_daily_budget then
    return jsonb_build_object('ok', false, 'reason', 'budget',
      'retry_after_s', ceil(extract(epoch from (v_day + interval '1 day' - now()))));
  end if;
  select count(*), min(created_at) into v_n, v_first from bb_ai_calls
   where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_n >= p_ip_per_hour then
    return jsonb_build_object('ok', false, 'reason', 'ip',
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_first + interval '1 hour' - now())))));
  end if;
  select count(*) into v_n from bb_ai_calls where bastion_id = p_bastion and created_at >= v_day;
  if v_n >= p_bastion_per_day then
    return jsonb_build_object('ok', false, 'reason', 'bastion',
      'retry_after_s', ceil(extract(epoch from (v_day + interval '1 day' - now()))));
  end if;
  select count(*) into v_n from bb_ai_calls where campaign = p_campaign and created_at >= v_day;
  if v_n >= p_campaign_per_day then
    return jsonb_build_object('ok', false, 'reason', 'campaign',
      'retry_after_s', ceil(extract(epoch from (v_day + interval '1 day' - now()))));
  end if;
  insert into bb_ai_calls (campaign, bastion_id, ip_hash, request)
  values (p_campaign, p_bastion, p_ip_hash, left(p_request, 1000)) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.bb_ai_finish(p_id bigint, p_status text, p_model text,
  p_input_tokens int, p_output_tokens int, p_cost_usd numeric, p_latency_ms int)
returns void language sql security definer set search_path = public as $$
  update bb_ai_calls set status = p_status, model = p_model, input_tokens = p_input_tokens,
    output_tokens = p_output_tokens, cost_usd = p_cost_usd, latency_ms = p_latency_ms
  where id = p_id;
$$;

revoke all on function public.bb_ai_admit(text, text, text, text, int, int, int, numeric) from public, anon, authenticated;
revoke all on function public.bb_ai_finish(bigint, text, text, int, int, numeric, int) from public, anon, authenticated;
grant execute on function public.bb_ai_admit(text, text, text, text, int, int, int, numeric) to service_role;
grant execute on function public.bb_ai_finish(bigint, text, text, int, int, numeric, int) to service_role;
