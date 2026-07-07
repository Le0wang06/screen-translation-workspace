# Screen Translation Workspace — Full Product Vision

> **Build this first:** see [MINIMUM_MVP_PLAN.md](./MINIMUM_MVP_PLAN.md) for the stripped-down v0 (upload → translate → save).
>
> This document describes the **full product** — glossary, translation memory, overlays, search, and review workflows. Use it as the north star, not the first sprint.

## 1. Product Thesis

Screen Translation Workspace is a web app for turning product screenshots into organized, editable, reusable translation steps.

The core loop should feel like this:

1. User adds or pastes a screenshot.
2. The app creates a workflow step.
3. The Screen Translation Agent reads the screenshot.
4. The agent extracts visible UI text.
5. The agent translates the text with screen context.
6. The agent organizes the result into a named product step.
7. The user edits, approves, comments, or adds terms to the glossary.
8. The approved translation is saved and reused later.

The product is not just a screenshot translator. Its value is that it understands product screens, workflows, UI elements, terminology, and previous approved translations.

## 2. MVP Positioning

The MVP should be built around one controlled intelligent workflow, not a large multi-agent system.

Primary agent name:

**Screen Translation Agent**

Primary job:

Take a screenshot, understand the UI and visible text, translate it, organize it into a product workflow step, and save structured data into the database.

The first version should behave like a reliable pipeline with AI in the middle:

```text
Screenshot -> OCR -> Context grouping -> Glossary and memory lookup -> Translation -> Structuring -> Save -> Human review
```

This is easier to debug than autonomous agent orchestration and gives the app a strong product loop immediately.

## 3. MVP Principles

1. Build one excellent workflow before building multiple agents.
2. Treat every screenshot as part of a product flow, not as an isolated image.
3. Store structured data early so the UI can render from the database.
4. Keep all AI output schema-bound and inspectable.
5. Make human review a first-class part of the product.
6. Reuse approved translations before generating new translations.
7. Keep the first UI practical, dense, and fast.
8. Defer desktop, browser extension, Figma plugin, mobile, PDF export, and complex team permissions.

## 4. Core User Flow

Example flow:

1. User creates a project called `Chinese Supplier App`.
2. User creates a flow called `Checkout Process`.
3. User uploads `payment_page.png`.
4. The app creates a step record.
5. The Screen Translation Agent processes the screenshot.
6. The app displays a screenshot with editable translated blocks.
7. User changes `Pay Now` to `Confirm Payment`.
8. User approves the translation.
9. The app saves `立即付款 -> Confirm Payment` to translation memory.
10. Future screenshots reuse or suggest the approved translation.

## 5. Core Workflow

```text
User uploads or pastes screenshot
        |
        v
Create step in database
        |
        v
Upload screenshot to storage
        |
        v
Run OCR on image
        |
        v
Clean and group OCR text
        |
        v
Check glossary and translation memory
        |
        v
Translate text blocks with UI context
        |
        v
Generate screen title, summary, warnings, and suggested glossary terms
        |
        v
Save OCR blocks and translations
        |
        v
Show editable overlay to user
```

## 6. Agent Modes

### Mode 1: Auto-Process Mode

This is the main product loop.

Trigger:

User uploads or pastes a screenshot.

Agent behavior:

1. Reads screenshot.
2. Extracts visible text.
3. Cleans and groups OCR output.
4. Translates text blocks.
5. Generates a step title and summary.
6. Flags uncertain translations.
7. Saves the result.
8. Returns structured data to the frontend.

### Mode 2: Ask Mode

This mode makes the product feel smarter without requiring more agent infrastructure.

Example user questions:

1. What does this screen mean?
2. Which button should the user click?
3. Is this translation consistent with previous screens?
4. What terms should go into the glossary?
5. Explain this screen to my English teammate.

Ask Mode can be added after the core processing loop works.

## 7. Recommended MVP Architecture

### Frontend

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- Next.js API routes or server actions
- TypeScript services
- One main agent workflow function: `processScreenshotStep()`

### Database

- Supabase Postgres

### Storage

- Supabase Storage for screenshots and uploaded assets

### AI and OCR

The MVP can support one OCR provider first, then abstract the provider later.

Good first options:

- OpenAI vision for screenshot understanding and structuring
- Google Vision OCR for text extraction and bounding boxes
- DeepL, Google Translate, or OpenAI for translation

Pragmatic MVP recommendation:

Start with provider interfaces, but only implement the provider you choose first.

Example interfaces:

```ts
interface OCRProvider {
  runOCR(input: { imageUrl: string }): Promise<OCRResult>
}

interface TranslationProvider {
  translateBlocks(input: TranslateBlocksInput): Promise<TranslatedBlock[]>
}

interface StructuringProvider {
  structureScreenshot(input: StructureScreenshotInput): Promise<StructuredScreenshotResult>
}
```

## 8. Why Not Multi-Agent Yet

Do not start with five agents.

Avoid this for MVP:

1. OCR Agent
2. Translation Agent
3. Glossary Agent
4. Review Agent
5. Project Manager Agent

That adds orchestration cost before the product loop is proven.

Instead, build one service with clear internal steps:

```ts
processScreenshotStep()
```

This service can later become an agent orchestration layer if needed.

## 9. Screen Translation Agent Responsibilities

The agent should:

1. Understand the screenshot as a product screen.
2. Identify the likely screen type.
3. Identify the main user action.
4. Identify visible UI elements.
5. Clean and group messy OCR text.
6. Translate with UI context.
7. Prefer glossary matches.
8. Prefer approved translation memory matches.
9. Keep UI translations short and natural.
10. Generate a useful step title.
11. Generate a concise screen summary.
12. Flag uncertain or context-sensitive translations.
13. Suggest glossary terms when repeated or important terms appear.
14. Return valid structured JSON only.

Examples of screen understanding:

```text
Screen type: Login page
Main action: Log in
Important warning: Password required
Visible elements: username input, password input, login button, forgot password link
```

Examples of OCR grouping:

```text
Bad OCR fragments:
立
即
付
款

Clean grouped text:
立即付款
```

Examples of UI-aware translation:

```text
Bad:
立即付款 -> Immediately payment

Good:
立即付款 -> Pay Now

Better after user approval:
立即付款 -> Confirm Payment
```

## 10. Agent Tools

For the MVP, keep the tool surface small.

| Tool | Purpose |
| --- | --- |
| `run_ocr(image_url)` | Extract visible text and bounding boxes from a screenshot. |
| `search_glossary(project_id, source_text)` | Find approved project term translations. |
| `search_translation_memory(project_id, source_text)` | Find previous approved translations. |
| `translate_blocks(blocks, target_language)` | Translate each OCR block with context. |
| `save_step_result(step_id, result_json)` | Save title, summary, OCR blocks, translations, warnings, and suggestions. |

These can be plain backend functions in the first version. They do not need to be formal agent tools until the product needs more dynamic behavior.

## 11. Main Backend Function

```ts
type ProcessScreenshotStepInput = {
  userId: string
  projectId: string
  flowId: string
  stepId: string
  imageUrl: string
  sourceLanguage?: string
  targetLanguage: string
}

async function processScreenshotStep({
  userId,
  projectId,
  flowId,
  stepId,
  imageUrl,
  sourceLanguage,
  targetLanguage,
}: ProcessScreenshotStepInput) {
  // 1. Run OCR
  const ocrResult = await runOCR({ imageUrl })

  // 2. Retrieve project glossary
  const glossary = await getProjectGlossary({ projectId })

  // 3. Retrieve translation memory matches
  const memoryMatches = await searchTranslationMemory({
    projectId,
    sourceTexts: ocrResult.blocks.map((block) => block.text),
  })

  // 4. Ask AI to structure and translate the screenshot
  const structuredResult = await structureScreenshotWithAI({
    imageUrl,
    ocrResult,
    glossary,
    memoryMatches,
    sourceLanguage,
    targetLanguage,
  })

  // 5. Save result
  await saveStepResult({
    userId,
    projectId,
    flowId,
    stepId,
    imageUrl,
    structuredResult,
  })

  // 6. Return to frontend
  return structuredResult
}
```

## 12. Structured Agent Output

The frontend should be able to render directly from this shape.

```json
{
  "screen_title": "Payment confirmation screen",
  "screen_summary": "The user reviews the order total, selects a payment method, and confirms payment.",
  "source_language": "zh",
  "target_language": "en",
  "confidence": 0.87,
  "text_blocks": [
    {
      "id": "block_1",
      "source_text": "立即付款",
      "translated_text": "Pay Now",
      "block_type": "button",
      "bbox": {
        "x": 420,
        "y": 812,
        "width": 160,
        "height": 48
      },
      "confidence": 0.94,
      "notes": "Primary checkout call-to-action.",
      "glossary_matches": [],
      "memory_match": null,
      "needs_review": false
    },
    {
      "id": "block_2",
      "source_text": "请选择付款方式",
      "translated_text": "Please select a payment method",
      "block_type": "warning",
      "bbox": {
        "x": 120,
        "y": 640,
        "width": 330,
        "height": 36
      },
      "confidence": 0.81,
      "notes": "Could be shown when no payment method is selected.",
      "glossary_matches": [
        {
          "source": "付款",
          "target": "payment"
        }
      ],
      "memory_match": null,
      "needs_review": true
    }
  ],
  "suggested_glossary_terms": [
    {
      "source": "付款",
      "target": "payment",
      "reason": "Repeated payment-related product term."
    }
  ],
  "warnings": [
    {
      "message": "Some payment terminology may need review for checkout context.",
      "severity": "medium"
    }
  ]
}
```

## 13. Suggested TypeScript Types

```ts
type BlockType =
  | "title"
  | "body"
  | "button"
  | "label"
  | "input"
  | "navigation"
  | "tab"
  | "warning"
  | "error"
  | "success"
  | "price"
  | "metadata"
  | "unknown"

type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

type GlossaryMatch = {
  source: string
  target: string
  notes?: string
}

type MemoryMatch = {
  sourceText: string
  translatedText: string
  similarity: number
  translationId: string
}

type StructuredTextBlock = {
  id: string
  source_text: string
  translated_text: string
  block_type: BlockType
  bbox?: BoundingBox
  confidence: number
  notes?: string
  glossary_matches: GlossaryMatch[]
  memory_match?: MemoryMatch | null
  needs_review: boolean
}

type SuggestedGlossaryTerm = {
  source: string
  target: string
  reason: string
}

type StructuredScreenshotResult = {
  screen_title: string
  screen_summary: string
  source_language: string
  target_language: string
  confidence: number
  text_blocks: StructuredTextBlock[]
  suggested_glossary_terms: SuggestedGlossaryTerm[]
  warnings: Array<{
    message: string
    severity: "low" | "medium" | "high"
  }>
}
```

## 14. Agent System Prompt Draft

```text
You are Screen Translation Agent, an AI assistant for translating and organizing product screenshots.

Your job is to analyze a screenshot from a product, app, dashboard, website, or workflow. You must extract the visible text, understand the UI context, translate the text accurately, and organize the result into structured JSON.

Priorities:
1. Preserve meaning.
2. Use short UI-friendly translations.
3. Keep product terms consistent with the glossary.
4. Prefer approved translation memory when available.
5. Identify buttons, labels, warnings, titles, navigation items, tabs, and form fields.
6. Flag uncertain translations for human review.
7. Do not invent text that is not visible.
8. Do not translate brand names unless the glossary says to.
9. Return valid JSON only.

For each text block, include:
- source_text
- translated_text
- block_type
- bbox if available
- confidence
- notes
- glossary_matches
- memory_match
- needs_review

Also generate:
- screen_title
- screen_summary
- source_language
- target_language
- confidence
- suggested_glossary_terms
- warnings
```

## 15. Database Tables

Keep the schema simple and product-shaped.

Relationship:

```text
Project
  -> Flow
    -> Step
      -> Screenshot asset
      -> OCR blocks
      -> Translations
      -> Comments
```

Required tables:

1. `projects`
2. `flows`
3. `steps`
4. `assets`
5. `ocr_blocks`
6. `translations`
7. `glossary_terms`
8. `translation_memory`
9. `comments`

### projects

Purpose:

Stores a translation workspace.

Suggested fields:

```text
id uuid primary key
owner_id uuid not null
name text not null
description text
source_language text
target_language text not null default 'en'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### flows

Purpose:

Stores ordered product workflows inside a project.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
name text not null
description text
position integer not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### steps

Purpose:

Stores one product screen inside a flow.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
flow_id uuid not null references flows(id)
title text
summary text
position integer not null default 0
status text not null default 'draft'
source_language text
target_language text not null default 'en'
agent_confidence numeric
processing_status text not null default 'pending'
processing_error text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Suggested `status` values:

```text
draft
machine_translated
in_review
approved
archived
```

Suggested `processing_status` values:

```text
pending
processing
completed
failed
```

### assets

Purpose:

Stores screenshot metadata.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
flow_id uuid references flows(id)
step_id uuid references steps(id)
kind text not null default 'screenshot'
storage_bucket text not null
storage_path text not null
public_url text
width integer
height integer
mime_type text
file_size_bytes bigint
created_at timestamptz not null default now()
```

### ocr_blocks

Purpose:

Stores extracted source text and bounding boxes.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
step_id uuid not null references steps(id)
asset_id uuid references assets(id)
source_text text not null
normalized_source_text text
block_type text
bbox_x numeric
bbox_y numeric
bbox_width numeric
bbox_height numeric
confidence numeric
position integer not null default 0
created_at timestamptz not null default now()
```

### translations

Purpose:

Stores machine and human translations for OCR blocks.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
step_id uuid not null references steps(id)
ocr_block_id uuid not null references ocr_blocks(id)
source_text text not null
translated_text text not null
target_language text not null
status text not null default 'machine'
provider text
confidence numeric
notes text
needs_review boolean not null default false
approved_by uuid
approved_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Suggested `status` values:

```text
machine
edited
approved
rejected
```

### glossary_terms

Purpose:

Stores approved project terminology.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
source text not null
target text not null
source_language text
target_language text not null default 'en'
notes text
created_by uuid
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended unique constraint:

```text
unique(project_id, source, target_language)
```

### translation_memory

Purpose:

Stores approved reusable translations.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
source_text text not null
translated_text text not null
source_language text
target_language text not null
context text
block_type text
translation_id uuid references translations(id)
approved_by uuid
approved_at timestamptz
usage_count integer not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended unique constraint:

```text
unique(project_id, source_text, target_language)
```

### comments

Purpose:

Stores review comments on steps or specific text blocks.

Suggested fields:

```text
id uuid primary key
project_id uuid not null references projects(id)
step_id uuid references steps(id)
ocr_block_id uuid references ocr_blocks(id)
translation_id uuid references translations(id)
author_id uuid not null
body text not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## 16. API Surface

Start with a small API.

### Projects

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
```

### Flows

```text
GET    /api/projects/:projectId/flows
POST   /api/projects/:projectId/flows
PATCH  /api/flows/:flowId
```

### Steps

```text
GET    /api/steps/:stepId
POST   /api/flows/:flowId/steps
PATCH  /api/steps/:stepId
POST   /api/steps/:stepId/process
```

### Assets

```text
POST   /api/steps/:stepId/assets
```

### Translations

```text
PATCH  /api/translations/:translationId
POST   /api/translations/:translationId/approve
```

### Glossary

```text
GET    /api/projects/:projectId/glossary
POST   /api/projects/:projectId/glossary
PATCH  /api/glossary/:termId
DELETE /api/glossary/:termId
```

### Search

```text
GET    /api/projects/:projectId/search?q=payment
```

## 17. MVP Pages

### 1. `/dashboard`

Purpose:

Shows projects.

Example project cards or rows:

```text
Supplier App Translation
Restaurant POS Translation
Japanese SaaS Dashboard
```

Keep this work-focused. A table or compact project grid is better than a marketing-style landing page.

### 2. `/projects/new`

Purpose:

Create a new project.

Fields:

1. Project name
2. Description
3. Source language
4. Target language

### 3. `/projects/[projectId]`

Purpose:

Project overview.

Shows:

1. Flows
2. Recent steps
3. Translation progress
4. Glossary shortcut
5. Search shortcut

### 4. `/projects/[projectId]/flows/[flowId]`

Purpose:

Shows ordered flow steps.

Example:

```text
1. Login screen
2. Product selection
3. Cart review
4. Payment confirmation
5. Order success
```

Primary action:

Upload or paste screenshot as a new step.

### 5. `/steps/[stepId]`

Purpose:

The most important page.

Layout:

```text
Left: screenshot
Center: translated overlay or block list
Right: selected text block details
```

Right panel:

```text
Original: 立即付款
Translation: Pay Now
Type: Button
Status: Machine translated

[Approve] [Edit] [Comment] [Add to glossary]
```

Important interactions:

1. Click a bounding box on the screenshot.
2. Select the corresponding text block.
3. Edit translation inline.
4. Approve translation.
5. Add source and target as glossary term.
6. Save approved translation to memory.
7. Mark a block as needing review.

### 6. `/projects/[projectId]/glossary`

Purpose:

Manage approved terminology.

Example table:

```text
Source | Translation | Notes
付款   | Payment     | Use for checkout/payment UI.
库存   | Inventory   | Do not translate as stock.
订单   | Order       | Product order, not command.
```

### 7. `/projects/[projectId]/search`

Purpose:

Search across screenshots, OCR text, translations, steps, and glossary.

Example:

```text
Search: payment

Results:
- Payment confirmation screen
- Checkout error screen
- Invoice setup screen
```

## 18. Step Editor UX Requirements

The step editor is the product.

Must have:

1. Screenshot display with stable dimensions.
2. Bounding boxes when OCR coordinates are available.
3. Selected block state.
4. Source text display.
5. Editable translation field.
6. Block type selector.
7. Needs review toggle.
8. Confidence indicator.
9. Approve button.
10. Add to glossary button.
11. Comment field.
12. Step title and summary editing.

Good MVP layout:

```text
--------------------------------------------------------------------------------
Top bar: Project / Flow / Step title                 Processing status / Save
--------------------------------------------------------------------------------
Main area:

[Screenshot with overlay]      [Block list]      [Selected block details]

--------------------------------------------------------------------------------
```

Avoid:

1. Decorative dashboard cards inside cards.
2. A marketing hero as the first app screen.
3. Huge typography inside compact tools.
4. Overly colorful UI.
5. Hidden review controls.

## 19. Suggested UI Style

The app should feel like an operational translation workspace.

Recommended style:

1. Dense but readable.
2. Neutral surface colors.
3. Clear borders and dividers.
4. Small but legible labels.
5. Practical tables and panels.
6. Compact toolbars.
7. Clear selected states.
8. Minimal animation.
9. Keyboard-friendly editing later.

Useful icons:

1. Upload
2. Search
3. Check
4. Pencil
5. MessageSquare
6. BookOpen
7. Languages
8. AlertTriangle
9. Save
10. MoreHorizontal

## 20. Processing States

Each step should clearly show processing state.

States:

```text
pending
uploading
processing_ocr
structuring
translating
saving
completed
failed
```

The database can store fewer normalized states, but the frontend may display more granular states during a request.

Recommended user-facing labels:

```text
Uploading screenshot
Reading screen text
Organizing UI text
Translating with glossary
Saving results
Ready for review
Processing failed
```

## 21. Translation Memory Behavior

When a user approves a translation:

1. Save or update a `translation_memory` row.
2. Increment usage count when reused.
3. Store context if available.
4. Prefer exact source text matches before fuzzy matches.
5. Use glossary matches even when translation memory exists.

MVP matching order:

1. Exact match on `project_id`, `source_text`, and `target_language`.
2. Normalized exact match.
3. Simple fuzzy match later.
4. Embedding similarity with pgvector later.

Do not add pgvector on day one unless search quality requires it.

## 22. Glossary Behavior

Glossary terms should be project-specific.

When structuring a screenshot:

1. Retrieve all glossary terms for small projects.
2. For larger projects, retrieve relevant terms by source text matching.
3. Pass matches into the AI prompt.
4. Show matched terms on each text block.
5. Let users add suggested terms after review.

The agent should suggest glossary terms when:

1. A source term appears repeatedly.
2. A term is likely product-specific.
3. A term affects UI consistency.
4. A term has multiple possible translations.

## 23. Human Review Rules

Set `needs_review` to true when:

1. OCR confidence is low.
2. Translation confidence is low.
3. The phrase is ambiguous.
4. The phrase may be legal, financial, medical, or policy-related.
5. The phrase contains product-specific terminology not found in glossary.
6. The phrase contains numbers, currency, addresses, dates, or account details and the translation may alter meaning.
7. The source text appears truncated.
8. The UI context is unclear.

Examples:

```text
开户地址
```

Possible meanings:

1. Account opening address
2. Registered address
3. Branch address

Recommended behavior:

Flag for review and explain the ambiguity in notes.

## 24. Day-by-Day Roadmap

### Day 1: Core App Structure

Build:

1. Next.js app structure.
2. Supabase auth.
3. Projects table.
4. Flows table.
5. Steps table.
6. Assets table.
7. Screenshot upload.
8. Basic step page.

Goal:

User can create a project and upload screenshots into ordered flow steps.

### Day 2: OCR and Translation

Build:

1. OCR service.
2. Translation service.
3. Save OCR blocks.
4. Save translations.
5. Display detected text list beside screenshot.

Goal:

Screenshot becomes editable translated text blocks.

### Day 3: Agent Structuring

Build:

1. `structureScreenshotWithAI()`.
2. JSON schema.
3. Step title generation.
4. Screen summary generation.
5. Block type classification.
6. Needs-review flags.

Goal:

The app feels smart, not just OCR plus translation.

### Day 4: Overlay Editor

Build:

1. Clickable bounding boxes.
2. Translation overlay.
3. Selected block panel.
4. Edit translation.
5. Approve translation.
6. Save approved translation to memory.

Goal:

User can visually review the translated screenshot.

### Day 5: Glossary and Memory

Build:

1. Glossary table UI.
2. Add glossary term.
3. Translation memory table.
4. Reuse approved translations.
5. Suggest glossary terms.

Goal:

The app gets better as users approve translations.

## 25. Build First

Build this:

1. Auth.
2. Project creation.
3. Flow creation.
4. Step creation.
5. Screenshot upload or paste.
6. OCR.
7. AI structuring.
8. Translation.
9. Editable text blocks.
10. Approve translation.
11. Save approved translation.
12. Glossary.
13. Translation memory.
14. Search.

## 26. Skip for Now

Do not build these in the MVP:

1. Desktop app.
2. Mobile app.
3. Camera live translation.
4. Figma plugin.
5. PDF export.
6. Team permissions.
7. Chrome extension.
8. Multi-agent orchestration.
9. Complex review workflow.
10. Billing.
11. Public sharing.
12. Offline mode.
13. Full localization management suite.

## 27. Risks and Mitigations

### Risk: OCR quality is inconsistent

Mitigation:

1. Keep source text editable.
2. Store OCR confidence.
3. Allow manual correction later.
4. Flag low-confidence blocks.

### Risk: Bounding boxes do not match grouped text

Mitigation:

1. Store raw OCR blocks and structured blocks separately if needed.
2. Allow approximate overlay placement.
3. Show a list view even when overlay confidence is poor.

### Risk: AI output is unpredictable

Mitigation:

1. Use structured JSON output.
2. Validate with a schema.
3. Retry or fail gracefully if invalid.
4. Save processing errors.

### Risk: Translation consistency is weak

Mitigation:

1. Prefer approved translation memory.
2. Use project glossary.
3. Show glossary matches on each block.
4. Let users approve corrections into memory.

### Risk: The app becomes too broad

Mitigation:

1. Protect the core loop.
2. Keep the first product centered on screenshot-to-step translation.
3. Delay non-core integrations.

## 28. Open Product Questions

These do not block the MVP, but should be answered before implementation decisions become expensive.

1. Which source languages are most important first?
2. Is the first target language always English?
3. Should OCR use OpenAI vision only, Google Vision only, or both behind an interface?
4. Should translation be OpenAI, DeepL, Google Translate, or configurable?
5. Should screenshot upload happen at the flow page or directly inside the step editor first?
6. Should users be able to manually create steps without screenshots?
7. Should approved translations be global to the project or scoped by flow?
8. Should glossary terms be case-sensitive for Latin languages?
9. Should the app store raw OCR provider output for debugging?
10. Should comments attach to a whole step, a block, a translation, or all three?

## 29. Implementation Order

Recommended order:

1. Initialize Next.js project.
2. Add Tailwind and shadcn/ui.
3. Add Supabase client setup.
4. Create database schema migrations.
5. Add auth middleware.
6. Build dashboard and project creation.
7. Build project and flow pages.
8. Build step creation and screenshot upload.
9. Build initial step editor shell.
10. Add `processScreenshotStep()`.
11. Add OCR provider.
12. Add AI structuring provider.
13. Save OCR blocks and translations.
14. Render block list.
15. Render screenshot overlay.
16. Add edit and approve flows.
17. Add glossary page.
18. Add translation memory reuse.
19. Add search.
20. Polish processing states and error handling.

## 30. MVP Success Criteria

The MVP is successful when:

1. A user can create a project.
2. A user can create a flow.
3. A user can upload a screenshot as a step.
4. The app extracts visible text.
5. The app translates visible text.
6. The app creates a step title and summary.
7. The app shows editable text blocks.
8. The user can approve a translation.
9. Approved translations are reused later.
10. Glossary terms influence translation.
11. The user can search previous screens and translations.

The core demo should be:

```text
Upload Chinese checkout screenshot
-> See translated UI blocks
-> Edit "Pay Now" to "Confirm Payment"
-> Approve it
-> Upload another screenshot with 立即付款
-> App suggests "Confirm Payment"
```

## 31. Cursor Build Prompt

Use this when starting implementation:

```text
Build an MVP web app called Screen Translation Workspace.

Use:
- Next.js App Router
- TypeScript
- Tailwind
- shadcn/ui
- Supabase Auth
- Supabase Postgres
- Supabase Storage

Core concept:
Users create projects. Each project has flows. Each flow has ordered steps. Each step contains a screenshot. When a screenshot is uploaded, the backend runs a Screen Translation Agent that extracts text, translates it, generates a step title and summary, and saves editable text blocks.

Build these database tables:
- projects
- flows
- steps
- assets
- ocr_blocks
- translations
- glossary_terms
- translation_memory
- comments

Build these pages:
1. /dashboard
2. /projects/new
3. /projects/[projectId]
4. /projects/[projectId]/flows/[flowId]
5. /steps/[stepId]
6. /projects/[projectId]/glossary
7. /projects/[projectId]/search

Build this backend function:
processScreenshotStep({
  userId,
  projectId,
  flowId,
  stepId,
  imageUrl,
  sourceLanguage,
  targetLanguage
})

The function should:
1. Run OCR on the screenshot.
2. Retrieve project glossary terms.
3. Retrieve translation memory matches.
4. Call an AI model to structure the screenshot into JSON.
5. Save OCR blocks and translations.
6. Return structured result to the frontend.

The step editor should show:
- Screenshot on the left.
- Detected text blocks.
- Editable translation fields.
- Clickable bounding boxes when coordinates are available.
- Approve button.
- Add to glossary button.
- Comment field.
- Step title and summary.

Keep the UI clean, minimal, and fast. Do not overbuild team permissions, desktop app, Chrome extension, Figma integration, PDF export, or multi-agent orchestration yet.
```

## 32. Current Decision

For the first implementation pass, build the agent as a single structured workflow:

```text
Screenshot -> OCR -> AI organize -> Translate -> Save -> Edit
```

This is simple enough for an MVP, but strong enough to feel like a real intelligent product.

The key product insight:

The agent should organize translation into product steps, not just translate text.
