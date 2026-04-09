create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'love', 'fire', 'laugh', 'wow')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, reaction)
);

create index if not exists idx_comment_reactions_comment_id
  on public.comment_reactions(comment_id);

alter table public.comment_reactions enable row level security;

drop policy if exists "comment_reactions_select_authenticated" on public.comment_reactions;
create policy "comment_reactions_select_authenticated"
  on public.comment_reactions
  for select
  to authenticated
  using (true);

drop policy if exists "comment_reactions_insert_own" on public.comment_reactions;
create policy "comment_reactions_insert_own"
  on public.comment_reactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "comment_reactions_delete_own" on public.comment_reactions;
create policy "comment_reactions_delete_own"
  on public.comment_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);
