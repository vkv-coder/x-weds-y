-- W weds Y - gallery storage bucket.
-- Open read+insert scoped strictly to this one bucket (wy-gallery) - the
-- gallery is deliberately "any guest can snap a photo and everyone sees
-- it instantly", so there's no per-guest write restriction here, same as
-- the public SELECT already granted on wy_itinerary/wy_announcements.
-- Policies are scoped to bucket_id = 'wy-gallery' only, never touching any
-- other app's bucket on this shared project.

insert into storage.buckets (id, name, public)
values ('wy-gallery', 'wy-gallery', true)
on conflict (id) do nothing;

drop policy if exists wy_gallery_public_read on storage.objects;
create policy wy_gallery_public_read on storage.objects
  for select using (bucket_id = 'wy-gallery');

drop policy if exists wy_gallery_public_upload on storage.objects;
create policy wy_gallery_public_upload on storage.objects
  for insert with check (bucket_id = 'wy-gallery');

-- Deliberately NO delete policy for anon/authenticated here - photo
-- deletion is admin-only and goes through the wy-admin-delete-photo Edge
-- Function (service role), not the client-side storage API. Granting an
-- open delete policy would let any guest delete anyone's photo directly.
