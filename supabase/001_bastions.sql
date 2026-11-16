-- Shared Bastion storage for Bastion Builder (raided-hex project).
-- The browser (publishable key) may read, insert, and update — never delete.
-- Deletes are done by the project owner via the Supabase CLI.

create table if not exists public.bb_bastions (
  id          text primary key,
  campaign    text not null,
  data        jsonb not null,
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bb_bastions_campaign_idx on public.bb_bastions (campaign);

-- Every overwritten version is kept so accidental wipes can be restored.
create table if not exists public.bb_bastion_history (
  hist_id     bigint generated always as identity primary key,
  id          text not null,
  campaign    text not null,
  data        jsonb not null,
  version     integer not null,
  saved_at    timestamptz not null default now()
);
create index if not exists bb_bastion_history_id_idx on public.bb_bastion_history (id, version desc);

create or replace function public.bb_bastions_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    insert into bb_bastion_history (id, campaign, data, version) values (old.id, old.campaign, old.data, old.version);
    new.id := old.id;               -- id and campaign are immutable from the client
    new.campaign := old.campaign;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if pg_column_size(new.data) > 1000000 then
    raise exception 'Bastion data too large';
  end if;
  return new;
end $$;

drop trigger if exists bb_bastions_before_write on public.bb_bastions;
create trigger bb_bastions_before_write before insert or update on public.bb_bastions
  for each row execute function public.bb_bastions_before_write();

alter table public.bb_bastions enable row level security;
alter table public.bb_bastion_history enable row level security;  -- no policies: invisible to the browser

drop policy if exists bb_read on public.bb_bastions;
drop policy if exists bb_insert on public.bb_bastions;
drop policy if exists bb_update on public.bb_bastions;
create policy bb_read   on public.bb_bastions for select to anon, authenticated using (true);
create policy bb_insert on public.bb_bastions for insert to anon, authenticated with check (true);
create policy bb_update on public.bb_bastions for update to anon, authenticated using (true) with check (true);
-- intentionally no DELETE policy

revoke delete, truncate on public.bb_bastions from anon, authenticated;
revoke all on public.bb_bastion_history from anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.bb_bastions;
exception when duplicate_object then null; end $$;
