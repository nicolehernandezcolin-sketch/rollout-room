-- Photos and videos attached to a scheduled post. They live in a private bucket, in a folder named for
-- the creator, only until the post is published; the posting function reads them through short-lived links.
insert into storage.buckets (id, name, public, file_size_limit)
values ('post-media', 'post-media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "Creators read their own post media" on storage.objects;
create policy "Creators read their own post media" on storage.objects
  for select to authenticated using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Creators add their own post media" on storage.objects;
create policy "Creators add their own post media" on storage.objects
  for insert to authenticated with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Creators remove their own post media" on storage.objects;
create policy "Creators remove their own post media" on storage.objects
  for delete to authenticated using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
