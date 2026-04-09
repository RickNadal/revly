-- top_riders view
-- Computes popularity score per user: follower_count × 2 + total_likes_received.
-- Followers are weighted 2× because they represent deliberate, sustained interest.
-- Used by the in-app leaderboard. No extra columns on profiles — purely computed.

create or replace view public.top_riders as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.is_premium,
  p.is_supporter,
  p.role,
  coalesce(fc.follower_count, 0)::int  as follower_count,
  coalesce(lc.total_likes, 0)::int     as total_likes,
  (coalesce(fc.follower_count, 0) * 2 + coalesce(lc.total_likes, 0))::int as score
from public.profiles p
left join (
  select following_id, count(*)::int as follower_count
  from public.follows
  group by following_id
) fc on fc.following_id = p.id
left join (
  select po.user_id, count(*)::int as total_likes
  from public.likes l
  join public.posts po on po.id = l.post_id
  group by po.user_id
) lc on lc.user_id = p.id
order by score desc;

-- Grant read access to authenticated users
grant select on public.top_riders to authenticated;
