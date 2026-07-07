-- Store the AI-regenerated screenshot with UI text in the target language.
alter table public.steps
  add column if not exists translated_image_url text not null default '';
