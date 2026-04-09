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
  greatest(
    1,
    round(
      c.weight *
      case
        when c.sponsor_type = 'house' then 1.0
        else coalesce(t.weight_multiplier, 1.0)
      end
    )::int
  ) as weight,
  c.placement,
  c.is_active,
  c.start_at,
  c.end_at,
  c.min_posts_between
from public.ad_campaigns c
left join public.business_accounts a on a.user_id = c.owner_user_id
left join public.business_subscriptions s on s.user_id = c.owner_user_id
left join public.business_tiers t on t.id = coalesce(s.tier_id, a.tier_id)
where c.status = 'active'
  and c.is_active = true
  and (c.start_at is null or c.start_at <= now())
  and (c.end_at is null or c.end_at >= now())
  and (
    c.sponsor_type = 'house'
    or (
      a.status = 'active'
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (
        (c.placement = 'discover' and t.discover_enabled = true)
        or (c.placement = 'following' and t.following_enabled = true)
      )
    )
  );

grant select on public.active_ad_campaigns to authenticated;
