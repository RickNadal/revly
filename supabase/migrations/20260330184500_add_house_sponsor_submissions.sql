create table if not exists public.house_sponsor_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  contact_email text not null,
  sponsor_name text not null,
  title text not null,
  body text not null,
  cta_text text null,
  cta_url text null,
  image_url text null,
  placement text not null default 'discover' check (placement in ('discover', 'following')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id) on delete set null
);

create index if not exists idx_house_sponsor_submissions_user_id
  on public.house_sponsor_submissions(user_id);

create index if not exists idx_house_sponsor_submissions_status
  on public.house_sponsor_submissions(status);

create index if not exists idx_house_sponsor_submissions_created_at
  on public.house_sponsor_submissions(created_at desc);

alter table public.house_sponsor_submissions enable row level security;

drop policy if exists house_sponsor_submissions_select_own on public.house_sponsor_submissions;
create policy house_sponsor_submissions_select_own
on public.house_sponsor_submissions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists house_sponsor_submissions_insert_own on public.house_sponsor_submissions;
create policy house_sponsor_submissions_insert_own
on public.house_sponsor_submissions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists house_sponsor_submissions_update_own_pending on public.house_sponsor_submissions;
create policy house_sponsor_submissions_update_own_pending
on public.house_sponsor_submissions
for update
to authenticated
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id and status = 'pending');

drop policy if exists house_sponsor_submissions_select_mod_admin on public.house_sponsor_submissions;
create policy house_sponsor_submissions_select_mod_admin
on public.house_sponsor_submissions
for select
to authenticated
using (public.is_admin_or_moderator(auth.uid()));

drop policy if exists house_sponsor_submissions_update_mod_admin on public.house_sponsor_submissions;
create policy house_sponsor_submissions_update_mod_admin
on public.house_sponsor_submissions
for update
to authenticated
using (public.is_admin_or_moderator(auth.uid()))
with check (public.is_admin_or_moderator(auth.uid()));

grant select, insert, update on public.house_sponsor_submissions to authenticated;
