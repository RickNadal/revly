-- active_ad_campaigns is a view. Ensure underlying source table has these columns.
ALTER TABLE IF EXISTS public.ad_campaigns
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
