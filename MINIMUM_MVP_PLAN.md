# Screen Translation Workspace — Minimum MVP (v0)

> **Goal:** A super simple app that borrows AI to translate screenshots and saves them as steps in a flow.
>
> **Not in v0:** translation memory, glossary, search, bounding-box overlays, approve workflows, multi-agent orchestration.
>
> **Full product vision:** [MVP_PLAN.md](./MVP_PLAN.md)

## 1. What This Is

You walk through an app, upload screenshots as you go, and the app translates each screen and saves it as a step. A teammate in another country can open the flow, read the translations, edit if needed, and leave comments.

That's the whole product for v0.

```text
Upload screenshot → AI translates → Save step → Teammate reviews
```

## 2. Core Loop

1. User creates a **flow** (e.g. "Checkout walkthrough").
2. User uploads a screenshot (or pastes from clipboard).
3. App creates a **step** and runs AI translation.
4. App saves title, source text, and translations.
5. User (or teammate) views the step, edits text, adds a comment.
6. User uploads the next screenshot. Repeat.

## 3. What We Are Not Building (v0)

| Skip | Why |
| --- | --- |
| Translation memory | Adds complexity; add when reuse becomes painful |
| Glossary | Same — defer until consistency matters |
| Search | Not needed with a handful of flows |
| Bounding-box overlay | Text list beside screenshot is enough |
| Approve / reject workflow | Save + edit is enough |
| Block types, warnings, suggestions | Nice later, not needed now |
| Ask mode | Defer |
| Team permissions / roles | Everyone on the project can view and comment |
| PDF export, sharing links | Defer |

## 4. Stack

- Next.js App Router + TypeScript + Tailwind + shadcn/ui
- Supabase Auth, Postgres, Storage
- One AI call per screenshot (vision model reads image, returns structured JSON)

## 5. Pipeline

One backend function. No separate OCR service on day one — let the vision model read the screenshot directly.

```text
Upload image to storage
        |
        v
Create step (status: processing)
        |
        v
AI: read screenshot → { title, summary, blocks[] }
        |
        v
Save blocks to DB
        |
        v
Step page shows screenshot + translations (status: done)
```

```ts
type ProcessStepInput = {
  stepId: string
  imageUrl: string
  sourceLanguage?: string
  targetLanguage: string
}

async function processStep(input: ProcessStepInput) {
  const result = await translateScreenshotWithAI(input)
  await saveStepResult(input.stepId, result)
  return result
}
```

## 6. AI Output Shape

Keep it small. The frontend renders from this.

```json
{
  "title": "Payment confirmation screen",
  "summary": "User reviews total and confirms payment.",
  "source_language": "zh",
  "target_language": "en",
  "blocks": [
    {
      "id": "1",
      "source_text": "立即付款",
      "translated_text": "Pay Now"
    },
    {
      "id": "2",
      "source_text": "请选择付款方式",
      "translated_text": "Please select a payment method"
    }
  ]
}
```

## 7. Database (4 tables)

```text
projects
  -> flows
    -> steps
      -> step_blocks
comments (on steps)
```

### projects

```text
id            uuid primary key
owner_id      uuid not null
name          text not null
source_language text
target_language text not null default 'en'
created_at    timestamptz default now()
```

### flows

```text
id            uuid primary key
project_id    uuid references projects(id)
name          text not null
position      integer default 0
created_at    timestamptz default now()
```

### steps

```text
id                  uuid primary key
flow_id             uuid references flows(id)
project_id          uuid references projects(id)
title               text
summary             text
image_url           text not null
status              text default 'processing'  -- processing | done | failed
error_message       text
source_language     text
target_language     text default 'en'
position            integer default 0
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

### step_blocks

```text
id              uuid primary key
step_id         uuid references steps(id)
source_text     text not null
translated_text text not null
position        integer default 0
created_at      timestamptz default now()
```

### comments

```text
id          uuid primary key
step_id     uuid references steps(id)
author_id   uuid not null
body        text not null
created_at  timestamptz default now()
```

## 8. API (minimal)

```text
GET    /api/projects
POST   /api/projects

GET    /api/projects/:id/flows
POST   /api/projects/:id/flows

GET    /api/flows/:id/steps
POST   /api/flows/:id/steps          -- upload screenshot, triggers processStep
GET    /api/steps/:id
PATCH  /api/steps/:id                -- edit title, summary
PATCH  /api/blocks/:id               -- edit translated_text
POST   /api/steps/:id/comments
```

## 9. Pages (3 + auth)

### `/` or `/dashboard`

List projects. Create new project.

### `/projects/[projectId]`

List flows. Create new flow.

### `/flows/[flowId]`

Ordered list of steps. **Upload screenshot** button (primary action).

Each step row: thumbnail, title, status badge.

### `/steps/[stepId]`

The main screen.

```text
+------------------------------------------+
|  Flow name / Step title                  |
+------------------------------------------+
|                                          |
|  [Screenshot]     |  Translations        |
|                   |  ----------------    |
|                   |  立即付款  Pay Now    |
|                   |  请选择...  Please.. |
|                   |                      |
|                   |  Comments            |
|                   |  [Add comment...]    |
+------------------------------------------+
```

Interactions:

1. View screenshot and translation list.
2. Click a block to edit `translated_text` inline.
3. Edit step title / summary.
4. Add a comment.

No bounding boxes. No approve button. No glossary panel.

## 10. UI Style

- Plain, fast, boring-in-a-good-way
- White/gray surfaces, clear borders
- Compact tables and lists
- Status badges: Processing / Ready / Failed

## 11. Build Order

### Day 1

1. Next.js + Tailwind + shadcn/ui
2. Supabase auth + client
3. DB migrations (4 tables + comments)
4. Dashboard + create project
5. Flow list + create flow

### Day 2

1. Step upload (Supabase Storage)
2. `processStep()` with AI
3. Save blocks
4. Step page — screenshot + translation list

### Day 3

1. Edit translations inline
2. Edit title / summary
3. Comments
4. Processing states + error handling
5. Polish upload flow on flow page

## 12. Success Criteria

v0 is done when:

1. User creates a project and flow.
2. User uploads a screenshot → AI translates it.
3. Step shows screenshot + translated text blocks.
4. User can edit a translation and it persists.
5. User can add a comment on a step.
6. User uploads multiple screenshots in order → flow reads like a walkthrough.

Demo:

```text
Create flow "Supplier App Checkout"
Upload login screen    → see translated blocks
Upload cart screen     → see translated blocks
Upload payment screen  → see translated blocks
Teammate opens flow, reads steps, leaves a comment
```

## 13. When to Grow Into Full Product

Move features from [MVP_PLAN.md](./MVP_PLAN.md) when you feel the pain:

| Pain | Add from full plan |
| --- | --- |
| Same phrase translated differently | Glossary |
| Re-translating the same text every upload | Translation memory |
| Hard to find old screens | Search |
| Want to click text on the image | Bounding-box overlay |
| Need sign-off before sharing | Approve workflow |

## 14. Cursor Build Prompt (v0)

```text
Build a minimal web app called Screen Translation Workspace.

Stack: Next.js App Router, TypeScript, Tailwind, shadcn/ui, Supabase.

Core loop: User creates a flow, uploads screenshots as ordered steps, AI translates visible UI text, results are saved and viewable.

Tables: projects, flows, steps, step_blocks, comments.

Pages:
- /dashboard (projects)
- /projects/[id] (flows)
- /flows/[id] (steps list + upload)
- /steps/[id] (screenshot + translations + comments)

Backend: processStep(stepId, imageUrl) — one AI vision call returns { title, summary, blocks[] }, save to DB.

Keep it simple. No glossary, no translation memory, no search, no bounding boxes, no approve workflow.
```
