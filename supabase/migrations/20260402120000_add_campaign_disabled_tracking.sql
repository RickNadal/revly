-- Add disabled_at column to track when campaigns are disabled

alter table public.ad_campaigns
  add column if not exists disabled_at timestamptz null;

create index if not exists idx_ad_campaigns_disabled_at
  on public.ad_campaigns(disabled_at)
  where disabled_at is not null;
