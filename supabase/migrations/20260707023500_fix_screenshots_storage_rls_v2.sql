-- Fix screenshots storage RLS (v2): keep storage.objects.name out of projects subquery
-- so `name` cannot resolve to projects.name.

drop policy if exists "screenshots_select_own" on storage.objects;
drop policy if exists "screenshots_insert_own" on storage.objects;
drop policy if exists "screenshots_update_own" on storage.objects;
drop policy if exists "screenshots_delete_own" on storage.objects;

create policy "screenshots_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] in (
      select p.id::text
      from public.projects p
      where p.owner_id = (select auth.uid())
    )
  );

create policy "screenshots_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] in (
      select p.id::text
      from public.projects p
      where p.owner_id = (select auth.uid())
    )
  );

create policy "screenshots_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] in (
      select p.id::text
      from public.projects p
      where p.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] in (
      select p.id::text
      from public.projects p
      where p.owner_id = (select auth.uid())
    )
  );

create policy "screenshots_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'screenshots'
    and (storage.foldername(name))[1] in (
      select p.id::text
      from public.projects p
      where p.owner_id = (select auth.uid())
    )
  );
