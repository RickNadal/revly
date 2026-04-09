create table if not exists public.business_tiers (
  id text primary key,
  name text not null,
  monthly_price_cents integer not null default 0,
  max_active_campaigns integer not null default 1,
  discover_enabled boolean not null default true,
  following_enabled boolean not null default false,
  weight_multiplier numeric(6,2) not null default 1.00,
  created_at timestamptz not null default now()
);

insert into public.business_tiers (id, name, monthly_price_cents, max_active_campaigns, discover_enabled, following_enabled, weight_multiplier)
values
  ('dealer_basic', 'Dealer Basic', 9900, 2, true, false, 1.00),
  ('dealer_pro', 'Dealer Pro', 24900, 6, true, true, 1.75)
on conflict (id) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  max_active_campaigns = excluded.max_active_campaigns,
  discover_enabled = excluded.discover_enabled,
  following_enabled = excluded.following_enabled,
  weight_multiplier = excluded.weight_multiplier;

create table if not exists public.business_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  contact_email text not null,
  dealer_type text null,
  tier_id text not null references public.business_tiers(id) default 'dealer_basic',
  status text not null default 'pending_review' check (status in ('pending_review', 'active', 'rejected', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  tier_id text not null references public.business_tiers(id),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'trialing', 'active', 'past_due', 'canceled', 'inactive')),
  stripe_customer_id text null,
  stripe_subscription_id text null,
  current_period_end timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_tier_id text not null references public.business_tiers(id) default 'dealer_basic',
  business_name text not null,
  contact_email text not null,
  placement text not null check (placement in ('discover', 'following')),
  message text null,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.ad_requests
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists requested_tier_id text references public.business_tiers(id) default 'dealer_basic',
  add column if not exists business_name text,
  add column if not exists contact_email text,
  add column if not exists placement text,
  add column if not exists message text,
  add column if not exists status text default 'new',
  add column if not exists created_at timestamptz default now();

update public.ad_requests
set requested_tier_id = coalesce(requested_tier_id, 'dealer_basic')
where requested_tier_id is null;

update public.ad_requests
set status = coalesce(status, 'new')
where status is null;

update public.ad_requests
set placement = coalesce(placement, 'discover')
where placement is null;

alter table public.ad_requests
  alter column user_id set not null,
  alter column requested_tier_id set not null,
  alter column placement set not null,
  alter column status set not null,
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ad_requests_placement_check'
      and conrelid = 'public.ad_requests'::regclass
  ) then
    alter table public.ad_requests
      add constraint ad_requests_placement_check check (placement in ('discover', 'following'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ad_requests_status_check'
      and conrelid = 'public.ad_requests'::regclass
  ) then
    alter table public.ad_requests
      add constraint ad_requests_status_check check (status in ('new', 'approved', 'rejected', 'closed'));
  end if;
end
$$;

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text null,
  sponsor_name text null,
  sponsor_type text null default 'business',
  badge_text text null default 'Sponsored',
  body text not null,
  cta_text text null,
  cta_url text null,
  image_url text null,
  weight integer not null default 1,
  placement text not null check (placement in ('discover', 'following')),
  is_active boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'active', 'paused', 'rejected', 'ended')),
  start_at timestamptz null,
  end_at timestamptz null,
  min_posts_between integer not null default 10,
  monthly_impression_cap integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ad_campaigns
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists title text,
  add column if not exists sponsor_name text,
  add column if not exists sponsor_type text default 'business',
  add column if not exists badge_text text default 'Sponsored',
  add column if not exists body text,
  add column if not exists cta_text text,
  add column if not exists cta_url text,
  add column if not exists image_url text,
  add column if not exists weight integer default 1,
  add column if not exists placement text,
  add column if not exists is_active boolean default false,
  add column if not exists status text default 'draft',
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists min_posts_between integer default 10,
  add column if not exists monthly_impression_cap integer,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ad_campaigns'
      and column_name = 'user_id'
  ) then
    execute 'update public.ad_campaigns set owner_user_id = coalesce(owner_user_id, user_id) where owner_user_id is null';
  end if;
end
$$;

update public.ad_campaigns
set sponsor_type = coalesce(sponsor_type, 'business'),
    badge_text = coalesce(badge_text, 'Sponsored'),
    weight = coalesce(weight, 1),
    status = coalesce(status, case when coalesce(is_active, false) then 'active' else 'draft' end),
    min_posts_between = coalesce(min_posts_between, 10),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where sponsor_type is null
   or badge_text is null
   or weight is null
   or status is null
   or min_posts_between is null
   or created_at is null
   or updated_at is null;

alter table public.ad_campaigns
  alter column sponsor_type set default 'business',
  alter column badge_text set default 'Sponsored',
  alter column weight set default 1,
  alter column is_active set default false,
  alter column status set default 'draft',
  alter column min_posts_between set default 10,
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ad_campaigns_placement_check'
      and conrelid = 'public.ad_campaigns'::regclass
  ) then
    alter table public.ad_campaigns
      add constraint ad_campaigns_placement_check check (placement in ('discover', 'following'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ad_campaigns_status_check'
      and conrelid = 'public.ad_campaigns'::regclass
  ) then
    alter table public.ad_campaigns
      add constraint ad_campaigns_status_check check (status in ('draft', 'pending_review', 'active', 'paused', 'rejected', 'ended'));
  end if;
end
$$;

create table if not exists public.ad_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.ad_campaigns(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  placement text not null check (placement in ('discover', 'following')),
  event_type text not null check (event_type in ('impression', 'click', 'hide')),
  created_at timestamptz not null default now()
);

create index if not exists idx_business_subscriptions_user_id on public.business_subscriptions(user_id);
create index if not exists idx_ad_requests_user_id on public.ad_requests(user_id);
create index if not exists idx_ad_campaigns_owner_user_id on public.ad_campaigns(owner_user_id);
create index if not exists idx_ad_campaigns_active_placement on public.ad_campaigns(is_active, placement, status);
create index if not exists idx_ad_events_campaign_id on public.ad_events(campaign_id);

create or replace function public.set_business_ads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_business_accounts_updated_at on public.business_accounts;
create trigger trg_business_accounts_updated_at
before update on public.business_accounts
for each row
execute procedure public.set_business_ads_updated_at();

drop trigger if exists trg_business_subscriptions_updated_at on public.business_subscriptions;
create trigger trg_business_subscriptions_updated_at
before update on public.business_subscriptions
for each row
execute procedure public.set_business_ads_updated_at();

drop trigger if exists trg_ad_campaigns_updated_at on public.ad_campaigns;
create trigger trg_ad_campaigns_updated_at
before update on public.ad_campaigns
for each row
execute procedure public.set_business_ads_updated_at();

alter table public.business_tiers enable row level security;
alter table public.business_accounts enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.ad_requests enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_events enable row level security;

drop policy if exists "business_tiers_read_authenticated" on public.business_tiers;
create policy "business_tiers_read_authenticated"
  on public.business_tiers
  for select
  to authenticated
  using (true);

drop policy if exists "business_accounts_read_own" on public.business_accounts;
create policy "business_accounts_read_own"
  on public.business_accounts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "business_accounts_insert_own" on public.business_accounts;
create policy "business_accounts_insert_own"
  on public.business_accounts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "business_accounts_update_own" on public.business_accounts;
create policy "business_accounts_update_own"
  on public.business_accounts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "business_subscriptions_read_own" on public.business_subscriptions;
create policy "business_subscriptions_read_own"
  on public.business_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "business_subscriptions_insert_own" on public.business_subscriptions;
create policy "business_subscriptions_insert_own"
  on public.business_subscriptions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "business_subscriptions_update_own" on public.business_subscriptions;
create policy "business_subscriptions_update_own"
  on public.business_subscriptions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ad_requests_read_own" on public.ad_requests;
create policy "ad_requests_read_own"
  on public.ad_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ad_requests_insert_own" on public.ad_requests;
create policy "ad_requests_insert_own"
  on public.ad_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "ad_campaigns_read_own" on public.ad_campaigns;
create policy "ad_campaigns_read_own"
  on public.ad_campaigns
  for select
  to authenticated
  using (auth.uid() = owner_user_id);

drop policy if exists "ad_campaigns_insert_own" on public.ad_campaigns;
create policy "ad_campaigns_insert_own"
  on public.ad_campaigns
  for insert
  to authenticated
  with check (auth.uid() = owner_user_id);

drop policy if exists "ad_campaigns_update_own" on public.ad_campaigns;
create policy "ad_campaigns_update_own"
  on public.ad_campaigns
  for update
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

drop policy if exists "ad_events_insert_authenticated" on public.ad_events;
create policy "ad_events_insert_authenticated"
  on public.ad_events
  for insert
  to authenticated
  with check (true);

drop policy if exists "ad_events_read_own_campaigns" on public.ad_events;
create policy "ad_events_read_own_campaigns"
  on public.ad_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.ad_campaigns c
      where c.id = campaign_id
        and c.owner_user_id = auth.uid()
    )
  );

create or replace view public.active_ad_campaigns as
select
  c.id,
  c.title,
  c.sponsor_name,
  c.sponsor_type,
  c.badge_text,
  c.body,
  c.cta_text,
  c.cta_url,
  c.image_url,
  greatest(1, round(c.weight * coalesce(t.weight_multiplier, 1.0))::int) as weight,
  c.placement,
  c.is_active,
  c.start_at,
  c.end_at,
  c.min_posts_between
from public.ad_campaigns c
join public.business_accounts a on a.user_id = c.owner_user_id
join public.business_subscriptions s on s.user_id = c.owner_user_id
join public.business_tiers t on t.id = coalesce(s.tier_id, a.tier_id)
where c.status = 'active'
  and c.is_active = true
  and a.status = 'active'
  and s.status in ('active', 'trialing')
  and (s.current_period_end is null or s.current_period_end > now())
  and (
    (c.placement = 'discover' and t.discover_enabled = true)
    or (c.placement = 'following' and t.following_enabled = true)
  )
  and (c.start_at is null or c.start_at <= now())
  and (c.end_at is null or c.end_at >= now());

grant select on public.business_tiers to authenticated;
grant select, insert, update on public.business_accounts to authenticated;
grant select, insert, update on public.business_subscriptions to authenticated;
grant select, insert on public.ad_requests to authenticated;
grant select, insert, update on public.ad_campaigns to authenticated;
grant select, insert on public.ad_events to authenticated;
grant select on public.active_ad_campaigns to authenticated;