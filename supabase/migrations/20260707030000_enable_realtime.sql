-- Enable Realtime for live step status and comments.

alter table public.steps replica identity full;
alter table public.comments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.steps;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.comments;
exception
  when duplicate_object then null;
end $$;
