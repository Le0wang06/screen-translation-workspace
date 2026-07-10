-- Persist collaborative markup on translated screenshots.

alter table public.steps
  add column if not exists annotation_document jsonb,
  add column if not exists annotated_image_url text;

comment on column public.steps.annotation_document is
  'tldraw document snapshot for collaborative markup on the translated screenshot';

comment on column public.steps.annotated_image_url is
  'Storage path for the translated screenshot with markup baked in';
