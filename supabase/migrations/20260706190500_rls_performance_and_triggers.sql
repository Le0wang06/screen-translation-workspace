-- Optimize RLS policies for initplan performance (auth.uid() evaluated once per query).

-- projects
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own"
  on public.projects for select
  using (owner_id = (select auth.uid()));

create policy "projects_insert_own"
  on public.projects for insert
  with check (owner_id = (select auth.uid()));

create policy "projects_update_own"
  on public.projects for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "projects_delete_own"
  on public.projects for delete
  using (owner_id = (select auth.uid()));

-- flows
drop policy if exists "flows_select_own" on public.flows;
drop policy if exists "flows_insert_own" on public.flows;
drop policy if exists "flows_update_own" on public.flows;
drop policy if exists "flows_delete_own" on public.flows;

create policy "flows_select_own"
  on public.flows for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "flows_insert_own"
  on public.flows for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "flows_update_own"
  on public.flows for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "flows_delete_own"
  on public.flows for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

-- steps
drop policy if exists "steps_select_own" on public.steps;
drop policy if exists "steps_insert_own" on public.steps;
drop policy if exists "steps_update_own" on public.steps;
drop policy if exists "steps_delete_own" on public.steps;

create policy "steps_select_own"
  on public.steps for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "steps_insert_own"
  on public.steps for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "steps_update_own"
  on public.steps for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "steps_delete_own"
  on public.steps for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = (select auth.uid())
    )
  );

-- step_blocks
drop policy if exists "step_blocks_select_own" on public.step_blocks;
drop policy if exists "step_blocks_insert_own" on public.step_blocks;
drop policy if exists "step_blocks_update_own" on public.step_blocks;
drop policy if exists "step_blocks_delete_own" on public.step_blocks;

create policy "step_blocks_select_own"
  on public.step_blocks for select
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "step_blocks_insert_own"
  on public.step_blocks for insert
  with check (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "step_blocks_update_own"
  on public.step_blocks for update
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "step_blocks_delete_own"
  on public.step_blocks for delete
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = (select auth.uid())
    )
  );

-- comments
drop policy if exists "comments_select_own" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "comments_update_own" on public.comments;
drop policy if exists "comments_delete_own" on public.comments;

create policy "comments_select_own"
  on public.comments for select
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = comments.step_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "comments_insert_own"
  on public.comments for insert
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = comments.step_id
        and projects.owner_id = (select auth.uid())
    )
  );

create policy "comments_update_own"
  on public.comments for update
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "comments_delete_own"
  on public.comments for delete
  using (author_id = (select auth.uid()));

-- Auto-update steps.updated_at on row changes
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists steps_set_updated_at on public.steps;

create trigger steps_set_updated_at
  before update on public.steps
  for each row
  execute function public.set_updated_at();
