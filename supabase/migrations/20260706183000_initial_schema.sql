-- Screen Translation Workspace — initial schema (v0)

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  source_language text,
  target_language text not null default 'en',
  created_at timestamptz not null default now()
);

create table public.flows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.flows (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text,
  summary text,
  image_url text not null default '',
  status text not null default 'processing'
    check (status in ('processing', 'done', 'failed')),
  error_message text,
  source_language text,
  target_language text not null default 'en',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.step_blocks (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.steps (id) on delete cascade,
  source_text text not null,
  translated_text text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.steps (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects (owner_id);
create index flows_project_id_idx on public.flows (project_id);
create index steps_flow_id_idx on public.steps (flow_id);
create index steps_project_id_idx on public.steps (project_id);
create index step_blocks_step_id_idx on public.step_blocks (step_id);
create index comments_step_id_idx on public.comments (step_id);

alter table public.projects enable row level security;
alter table public.flows enable row level security;
alter table public.steps enable row level security;
alter table public.step_blocks enable row level security;
alter table public.comments enable row level security;

-- projects
create policy "projects_select_own"
  on public.projects for select
  using (owner_id = auth.uid());

create policy "projects_insert_own"
  on public.projects for insert
  with check (owner_id = auth.uid());

create policy "projects_update_own"
  on public.projects for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "projects_delete_own"
  on public.projects for delete
  using (owner_id = auth.uid());

-- flows
create policy "flows_select_own"
  on public.flows for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "flows_insert_own"
  on public.flows for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "flows_update_own"
  on public.flows for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "flows_delete_own"
  on public.flows for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = flows.project_id
        and projects.owner_id = auth.uid()
    )
  );

-- steps
create policy "steps_select_own"
  on public.steps for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "steps_insert_own"
  on public.steps for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "steps_update_own"
  on public.steps for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "steps_delete_own"
  on public.steps for delete
  using (
    exists (
      select 1 from public.projects
      where projects.id = steps.project_id
        and projects.owner_id = auth.uid()
    )
  );

-- step_blocks
create policy "step_blocks_select_own"
  on public.step_blocks for select
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "step_blocks_insert_own"
  on public.step_blocks for insert
  with check (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "step_blocks_update_own"
  on public.step_blocks for update
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "step_blocks_delete_own"
  on public.step_blocks for delete
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = step_blocks.step_id
        and projects.owner_id = auth.uid()
    )
  );

-- comments
create policy "comments_select_own"
  on public.comments for select
  using (
    exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = comments.step_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "comments_insert_own"
  on public.comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.steps
      join public.projects on projects.id = steps.project_id
      where steps.id = comments.step_id
        and projects.owner_id = auth.uid()
    )
  );

create policy "comments_update_own"
  on public.comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "comments_delete_own"
  on public.comments for delete
  using (author_id = auth.uid());
