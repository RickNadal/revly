-- Create saved stories table to track user's saved stories
create table public.saved_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  saved_at timestamp with time zone default now(),
  unique(user_id, story_id)
);

-- Create indexes for efficient querying
create index saved_stories_user_id_idx on public.saved_stories(user_id);
create index saved_stories_story_id_idx on public.saved_stories(story_id);

-- Enable RLS
alter table public.saved_stories enable row level security;

-- Users can view their own saved stories
create policy "Users can view their own saved stories"
  on public.saved_stories
  for select
  using (auth.uid() = user_id);

-- Users can save stories
create policy "Users can save stories"
  on public.saved_stories
  for insert
  with check (auth.uid() = user_id);

-- Users can remove saved stories
create policy "Users can remove saved stories"
  on public.saved_stories
  for delete
  using (auth.uid() = user_id);

-- Grant permissions
grant select, insert, delete on public.saved_stories to authenticated;
