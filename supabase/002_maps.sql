-- Bastion maps: public-read bucket, anyone may upload new files.
-- No select policy (no listing), no update (no overwrite), no delete.
-- Which maps belong to a Bastion is recorded in bb_bastions.data.maps.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bb-maps', 'bb-maps', true, 10485760,
        array['image/png','image/jpeg','image/webp','image/gif','application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "bb maps anon upload" on storage.objects;
create policy "bb maps anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'bb-maps');
