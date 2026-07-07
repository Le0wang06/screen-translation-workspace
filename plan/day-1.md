# Day 1 — Foundation

> **Parent:** [MINIMUM_MVP_PLAN.md](../MINIMUM_MVP_PLAN.md) §11  
> **Goal:** A signed-in user can create a project and flows inside it. No screenshots, AI, or steps yet.

## Outcome

By end of Day 1 you should be able to:

1. Run the app locally (`npm run dev`)
2. Sign up / sign in with Supabase Auth
3. See a dashboard listing your projects
4. Create a new project (name + target language)
5. Open a project and see its flows
6. Create a new flow inside that project

**Not in scope today:** step upload, storage, AI translation, step page, comments, editing translations.

---

## Checklist

### 1. Scaffold Next.js app

- [ ] Create Next.js 15 app (App Router, TypeScript, Tailwind, ESLint)
- [ ] Add shadcn/ui (`button`, `input`, `card`, `badge`, `dialog`, `form`, `label`)
- [ ] Set up basic layout: app shell with header, main content area
- [ ] Add `.env.example` with required Supabase vars (no secrets committed)

**Env vars:**

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### 2. Supabase project + client

- [ ] Create Supabase project (or use existing)
- [ ] Install `@supabase/supabase-js` and `@supabase/ssr`
- [ ] Add browser client (`lib/supabase/client.ts`)
- [ ] Add server client (`lib/supabase/server.ts`)
- [ ] Add middleware for session refresh (`middleware.ts`)

### 3. Auth

- [ ] Login page (`/login`) — email + password
- [ ] Sign-up on same page or separate `/signup`
- [ ] Redirect unauthenticated users to `/login`
- [ ] Redirect authenticated users away from `/login` to `/dashboard`
- [ ] Sign-out button in header

**Keep it simple:** email/password only. No OAuth, magic links, or team invites.

### 4. Database migrations

Run a single migration with all v0 tables. RLS policies included from the start.

**Tables (from MINIMUM_MVP_PLAN §7):**

| Table | Purpose today |
| --- | --- |
| `projects` | Create + list on dashboard |
| `flows` | Create + list on project page |
| `steps` | Schema only — no UI yet |
| `step_blocks` | Schema only — no UI yet |
| `comments` | Schema only — no UI yet |

**`projects`**

```sql
id              uuid primary key default gen_random_uuid()
owner_id        uuid not null references auth.users(id)
name            text not null
source_language text
target_language text not null default 'en'
created_at      timestamptz default now()
```

**`flows`**

```sql
id          uuid primary key default gen_random_uuid()
project_id  uuid not null references projects(id) on delete cascade
name        text not null
position    integer default 0
created_at  timestamptz default now()
```

**`steps`** (migrate now, use on Day 2)

```sql
id              uuid primary key default gen_random_uuid()
flow_id         uuid not null references flows(id) on delete cascade
project_id      uuid not null references projects(id) on delete cascade
title           text
summary         text
image_url       text not null default ''
status          text default 'processing'
error_message   text
source_language text
target_language text default 'en'
position        integer default 0
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

**`step_blocks`** (migrate now, use on Day 2)

```sql
id              uuid primary key default gen_random_uuid()
step_id         uuid not null references steps(id) on delete cascade
source_text     text not null
translated_text text not null
position        integer default 0
created_at      timestamptz default now()
```

**`comments`** (migrate now, use on Day 3)

```sql
id          uuid primary key default gen_random_uuid()
step_id     uuid not null references steps(id) on delete cascade
author_id   uuid not null references auth.users(id)
body        text not null
created_at  timestamptz default now()
```

**RLS (minimum for Day 1):**

- `projects`: owner can `select`, `insert`, `update`, `delete` where `owner_id = auth.uid()`
- `flows`: access via parent project ownership (`project_id` join to `projects.owner_id`)
- `steps`, `step_blocks`, `comments`: same pattern via `project_id` — policies in place even if unused today

### 5. API routes

| Method | Route | Action |
| --- | --- | --- |
| `GET` | `/api/projects` | List current user's projects |
| `POST` | `/api/projects` | Create project `{ name, source_language?, target_language }` |
| `GET` | `/api/projects/[id]/flows` | List flows for project |
| `POST` | `/api/projects/[id]/flows` | Create flow `{ name }` |

All routes: require auth, return 401 if no session, validate ownership on project-scoped routes.

### 6. Pages

#### `/dashboard` (or `/`)

- List projects (name, target language, created date)
- "New project" button → dialog or inline form
- Click project row → `/projects/[projectId]`
- Empty state: "No projects yet. Create one to get started."

#### `/projects/[projectId]`

- Breadcrumb: Dashboard → Project name
- List flows (name, step count if easy — otherwise skip count for Day 1)
- "New flow" button → dialog or inline form
- Click flow row → `/flows/[flowId]` (can be a stub page: "Steps coming on Day 2")
- Empty state: "No flows yet. Create one to start your walkthrough."

#### `/flows/[flowId]` (stub)

- Show flow name and project context
- Placeholder: "Upload screenshots here on Day 2"
- Enough to confirm navigation works end-to-end

### 7. UI style (Day 1)

Per MINIMUM_MVP_PLAN §10:

- White/gray surfaces, clear borders
- Compact tables or simple card lists
- No custom design system beyond shadcn defaults
- Fast and boring-in-a-good-way

---

## Suggested file structure

```text
app/
  layout.tsx
  page.tsx                    → redirect to /dashboard or /login
  login/page.tsx
  dashboard/page.tsx
  projects/[projectId]/page.tsx
  flows/[flowId]/page.tsx     → stub
  api/
    projects/route.ts
    projects/[id]/flows/route.ts
lib/
  supabase/client.ts
  supabase/server.ts
components/
  app-header.tsx
  project-list.tsx
  create-project-dialog.tsx
  flow-list.tsx
  create-flow-dialog.tsx
supabase/
  migrations/
    001_initial_schema.sql
middleware.ts
.env.example
```

---

## Order of work

Do these in sequence — each step unblocks the next:

```text
1. Scaffold Next.js + shadcn
        ↓
2. Supabase project + env + clients + middleware
        ↓
3. Auth pages + route protection
        ↓
4. DB migration (all tables + RLS)
        ↓
5. Projects API + dashboard page
        ↓
6. Flows API + project page + flow stub page
        ↓
7. Smoke test end-to-end
```

---

## Smoke test (definition of done)

Run through this manually before calling Day 1 complete:

1. `npm run dev` — app loads without errors
2. Sign up with a new email
3. Land on dashboard (empty)
4. Create project "Supplier App" with target language `en`
5. Project appears in list; click through to project page
6. Create flow "Checkout walkthrough"
7. Flow appears in list; click through to flow stub page
8. Sign out → redirected to login
9. Sign back in → projects and flows still there

---

## Risks / watch-outs

| Risk | Mitigation |
| --- | --- |
| RLS blocks reads after insert | Test insert + select in same session immediately |
| Middleware redirect loops | Exclude `/login`, `/api`, static assets from auth check |
| shadcn path aliases | Use `@/` consistently from the start |
| Over-building flow page | Stub only — upload UI is Day 2 |

---

## Handoff to Day 2

Day 1 leaves you with:

- Auth working
- `projects` and `flows` CRUD
- `steps` / `step_blocks` tables ready (empty)
- Navigation to `/flows/[flowId]` where upload will live

Day 2 picks up: Supabase Storage bucket, step upload, `processStep()` AI call, step detail page.
