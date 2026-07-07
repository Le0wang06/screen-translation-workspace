# Day 2 — Upload + AI + Step View

> **Parent:** [MINIMUM_MVP_PLAN.md](../MINIMUM_MVP_PLAN.md) §11  
> **Requires:** [Day 1](./day-1.md) complete  
> **Goal:** Upload a screenshot, AI translates it, step page shows image + text blocks.

## Outcome

1. Upload screenshot on flow page (file picker or paste)
2. Image saved to Supabase Storage
3. Step created with `status: processing`
4. AI reads screenshot → title, summary, blocks
5. Blocks saved to DB, step becomes `done`
6. Step page shows screenshot + translation list

**Not in scope today:** inline edits, comments, retry UI polish.

---

## Checklist

### 1. Storage

- [ ] Create bucket `screenshots` (private)
- [ ] RLS: authenticated users can upload/read files for their projects
- [ ] Path pattern: `{projectId}/{flowId}/{stepId}.png`

### 2. API

| Method | Route | What it does |
| --- | --- | --- |
| `GET` | `/api/flows/[id]/steps` | List steps (ordered by `position`) |
| `POST` | `/api/flows/[id]/steps` | Upload image, create step, run `processStep` |
| `GET` | `/api/steps/[id]` | Step + blocks for detail page |

**`POST /api/flows/[id]/steps` flow:**

```text
Receive image file
  → upload to Storage
  → insert step (status: processing)
  → call processStep()
  → return step id
```

Run `processStep` in the same request for v0 (simple). Move to background job later if slow.

### 3. `processStep()`

One function. One AI vision call.

```ts
// lib/process-step.ts
async function processStep(input: {
  stepId: string
  imageUrl: string
  sourceLanguage?: string
  targetLanguage: string
})
```

**Pipeline:**

```text
Fetch image → AI vision call → parse JSON → update step → insert blocks → status: done
```

On failure: set `status: failed`, save `error_message`.

**AI output shape:**

```json
{
  "title": "Payment confirmation screen",
  "summary": "User reviews total and confirms payment.",
  "source_language": "zh",
  "target_language": "en",
  "blocks": [
    { "source_text": "立即付款", "translated_text": "Pay Now" }
  ]
}
```

Add to `.env.example`:

```env
OPENAI_API_KEY=
# or whichever provider you use
```

### 4. Flow page (`/flows/[flowId]`)

Replace Day 1 stub with:

- Ordered step list (thumbnail, title, status badge)
- **Upload screenshot** button (primary)
- Click step → `/steps/[stepId]`
- Empty state: "No steps yet. Upload your first screenshot."

Status badges: `Processing` · `Ready` · `Failed`

### 5. Step page (`/steps/[stepId]`)

```text
+------------------------------------------+
|  Flow name / Step title                  |
+------------------------------------------+
|  [Screenshot]     |  Translations        |
|                   |  立即付款  Pay Now    |
|                   |  请选择...  Please.. |
+------------------------------------------+
```

- Left: full screenshot image
- Right: list of `source_text` → `translated_text`
- Show title + summary at top
- If `processing`: show loading state
- If `failed`: show error message

Read-only for today — editing is Day 3.

---

## Order of work

```text
1. Storage bucket + RLS
        ↓
2. POST /api/flows/[id]/steps (upload only, no AI yet)
        ↓
3. processStep() + AI integration
        ↓
4. GET steps + flow page list
        ↓
5. Step detail page
        ↓
6. Smoke test
```

---

## Smoke test

1. Open flow "Checkout walkthrough"
2. Upload a screenshot with visible UI text
3. Step appears with `Processing` badge
4. After AI finishes → badge becomes `Ready`
5. Open step → see screenshot + translated blocks
6. Upload a second screenshot → both steps show in order
7. Break AI key on purpose → step shows `Failed` with message

---

## Handoff to Day 3

You have the core loop working: upload → translate → view.

Day 3 adds: edit translations, edit title/summary, comments, polish.
