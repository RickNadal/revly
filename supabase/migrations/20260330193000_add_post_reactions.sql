create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('fire', 'hundred', 'flabbergasted', 'sadtear', 'laughtears', 'bicep', 'salute')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_post_reactions_post_id on public.post_reactions(post_id);

alter table public.post_reactions enable row level security;

drop policy if exists post_reactions_select_authenticated on public.post_reactions;
create policy post_reactions_select_authenticated
on public.post_reactions
for select
to authenticated
using (true);

drop policy if exists post_reactions_insert_own on public.post_reactions;
create policy post_reactions_insert_own
on public.post_reactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists post_reactions_update_own on public.post_reactions;
create policy post_reactions_update_own
on public.post_reactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists post_reactions_delete_own on public.post_reactions;
create policy post_reactions_delete_own
on public.post_reactions
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_post_reactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_post_reactions_updated_at on public.post_reactions;
create trigger trg_post_reactions_updated_at
before update on public.post_reactions
for each row
execute procedure public.set_post_reactions_updated_at();

grant select, insert, update, delete on public.post_reactions to authenticated;