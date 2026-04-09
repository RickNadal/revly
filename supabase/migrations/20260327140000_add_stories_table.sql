-- Create stories table for 24-hour stories
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone not null,
  viewed_by jsonb default '[]'::jsonb
);

-- Create indexes for efficient querying
create index stories_user_id_idx on public.stories(user_id);
create index stories_expires_at_idx on public.stories(expires_at);
create index stories_created_at_idx on public.stories(created_at desc);

-- Enable RLS
alter table public.stories enable row level security;

-- Allow users to view all non-expired stories
create policy "Users can view non-expired stories"
  on public.stories
  for select
  using (expires_at > now());

-- Allow users to create stories for themselves
create policy "Users can create their own stories"
  on public.stories
  for insert
  with check (auth.uid() = user_id);

-- Allow users to update their own stories
create policy "Users can update their own stories"
  on public.stories
  for update
  using (auth.uid() = user_id);

-- Allow users to delete their own stories
create policy "Users can delete their own stories"
  on public.stories
  for delete
  using (auth.uid() = user_id);

-- Grant permissions
grant select, insert, update, delete on public.stories to authenticated;
