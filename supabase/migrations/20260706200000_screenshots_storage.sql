-- Private bucket for screenshot uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screenshots',
  'screenshots',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Path pattern: {projectId}/{flowId}/{stepId}.{ext}
-- Owner access via first folder segment = project id

create policy "screenshots_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'screenshots'
    and exists (
      select 1 from public.projects
      where projects.id::text = (storage.foldername(name))[1]
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "screenshots_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'screenshots'
    and exists (
      select 1 from public.projects
      where projects.id::text = (storage.foldername(name))[1]
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "screenshots_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'screenshots'
    and exists (
      select 1 from public.projects
      where projects.id::text = (storage.foldername(name))[1]
        and projects.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'screenshots'
    and exists (
      select 1 from public.projects
      where projects.id::text = (storage.foldername(name))[1]
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "screenshots_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'screenshots'
    and exists (
      select 1 from public.projects
      where projects.id::text = (storage.foldername(name))[1]
        and projects.owner_id = (select auth.uid())
    )
  );
