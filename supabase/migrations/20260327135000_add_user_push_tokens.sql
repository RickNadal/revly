create table if not exists public.user_push_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null default 'unknown',
  disabled boolean not null default false,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_push_tokens_user_id on public.user_push_tokens(user_id);

alter table public.user_push_tokens enable row level security;

drop policy if exists "users_can_read_own_push_tokens" on public.user_push_tokens;
create policy "users_can_read_own_push_tokens"
  on public.user_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users_can_insert_own_push_tokens" on public.user_push_tokens;
create policy "users_can_insert_own_push_tokens"
  on public.user_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users_can_update_own_push_tokens" on public.user_push_tokens;
create policy "users_can_update_own_push_tokens"
  on public.user_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_user_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_push_tokens_updated_at on public.user_push_tokens;
create trigger trg_user_push_tokens_updated_at
before update on public.user_push_tokens
for each row
execute procedure public.set_user_push_tokens_updated_at();
