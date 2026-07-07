# Day 3 — Edit, Comments, Polish

> **Parent:** [MINIMUM_MVP_PLAN.md](../MINIMUM_MVP_PLAN.md) §11  
> **Requires:** [Day 2](./day-2.md) complete  
> **Goal:** v0 is demo-ready. Users can fix translations, comment, and upload a full walkthrough.

## Outcome

1. Edit `translated_text` inline on a block
2. Edit step title and summary
3. Add comments on a step
4. Processing / failed states feel solid
5. Upload flow on flow page is smooth

This completes the [v0 success criteria](../MINIMUM_MVP_PLAN.md#12-success-criteria).

**Not in scope:** glossary, translation memory, search, bounding boxes, approve workflow.

---

## Checklist

### 1. API

| Method | Route | What it does |
| --- | --- | --- |
| `PATCH` | `/api/steps/[id]` | Update `title`, `summary` |
| `PATCH` | `/api/blocks/[id]` | Update `translated_text` |
| `POST` | `/api/steps/[id]/comments` | Add comment `{ body }` |
| `GET` | `/api/steps/[id]/comments` | List comments (if not bundled in step GET) |

Validate ownership on every route.

### 2. Edit translations

On step page, each block row:

- Click translation → inline input
- Save on blur or Enter
- Optimistic update optional; must persist to DB

### 3. Edit title / summary

- Click title or summary → editable field
- `PATCH /api/steps/[id]` on save

### 4. Comments

Below translations on step page:

```text
Comments
────────
alice · 2 min ago
  "Should this say 'Checkout' not 'Cart'?"

[Add comment...]  [Post]
```

- List existing comments (author, time, body)
- Textarea + Post button
- New comment appears without full page reload

### 5. Polish

- [ ] Flow page: clear upload button, drag-and-drop optional
- [ ] Processing: spinner or skeleton on step page while AI runs
- [ ] Failed: show error + "Try again" (re-upload or retry button)
- [ ] Auto-refresh or poll step status while `processing`
- [ ] Breadcrumbs: Dashboard → Project → Flow → Step
- [ ] Basic empty states everywhere

---

## Order of work

```text
1. PATCH APIs (step + block)
        ↓
2. Inline edit UI on step page
        ↓
3. Comments API + UI
        ↓
4. Processing poll + error states
        ↓
5. Upload polish on flow page
        ↓
6. Full demo smoke test
```

---

## Smoke test (v0 done)

Run the full demo from MINIMUM_MVP_PLAN §12:

1. Create project + flow "Supplier App Checkout"
2. Upload login screen → translated blocks appear
3. Upload cart screen → second step in order
4. Upload payment screen → third step in order
5. Edit a translation → refresh → edit persists
6. Add a comment on payment step
7. Sign in as teammate (second account) → see flow, read steps, leave comment

---

## v0 complete when

| # | Criterion |
| --- | --- |
| 1 | User creates project and flow |
| 2 | User uploads screenshot → AI translates |
| 3 | Step shows screenshot + blocks |
| 4 | User edits translation → persists |
| 5 | User adds comment |
| 6 | Multiple screenshots form an ordered walkthrough |

After this, pick features from [MVP_PLAN.md](../MVP_PLAN.md) only when you feel the pain (§13).
