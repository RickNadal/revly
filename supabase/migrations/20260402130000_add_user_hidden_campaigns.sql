-- Track which campaigns users have hidden and when

create table if not exists public.user_hidden_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id text not null,
  hidden_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, campaign_id)
);

create index if not exists idx_user_hidden_campaigns_user_id
  on public.user_hidden_campaigns(user_id);

create index if not exists idx_user_hidden_campaigns_hidden_at
  on public.user_hidden_campaigns(hidden_at);

alter table public.user_hidden_campaigns enable row level security;

-- Users can read and modify their own hidden campaigns
create policy "users can manage own hidden campaigns"
  on public.user_hidden_campaigns
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create a view to get expired hidden campaigns (older than 36 hours)
create or replace view public.expired_user_hidden_campaigns as
select 
  id,
  user_id,
  campaign_id,
  hidden_at,
  now() - hidden_at as age_interval
from public.user_hidden_campaigns
where hidden_at < now() - interval '36 hours';

grant select on public.user_hidden_campaigns to authenticated;
grant select on public.expired_user_hidden_campaigns to authenticated;
