alter table public.ad_campaigns
add column if not exists moderation_note text,
add column if not exists rejection_reason text,
add column if not exists reviewed_at timestamptz,
add column if not exists reviewed_by uuid references auth.users(id) on delete set null;