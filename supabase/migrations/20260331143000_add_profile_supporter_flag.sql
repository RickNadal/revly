alter table public.profiles
  add column if not exists is_supporter boolean not null default false;
