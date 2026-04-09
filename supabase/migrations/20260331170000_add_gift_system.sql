-- Gift types catalog
create table if not exists public.gift_types (
  id          text primary key,          -- e.g. "fire", "crown"
  name        text not null,
  emoji       text not null,
  description text not null default '',
  price_cents int  not null,             -- USD cents, charged via Stripe
  score_value int  not null,             -- points added to recipients leaderboard score
  sort_order  int  not null default 0,
  active      boolean not null default true
);

alter table public.gift_types enable row level security;
create policy "Anyone can read active gift types"
  on public.gift_types for select using (active = true);

-- Seed gift types
insert into public.gift_types (id, name, emoji, price_cents, score_value, sort_order) values
  ('fire',      'Fire',      '🔥', 99,   5,   1),
  ('lightning', 'Lightning', '⚡', 199,  12,  2),
  ('diamond',   'Diamond',   '💎', 499,  30,  3),
  ('crown',     'Crown',     '👑', 999,  75,  4),
  ('trophy',    'Trophy',    '🏆', 1999, 200, 5)
on conflict (id) do nothing;
-- Gift types catalog
create table if not exists public.gift_types (
  id          text primary key,
  name        text not null,
  emoji       text not null,
  description text not null default '',
  price_cents int  not null,
  score_value int  not null,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

alter table public.gift_types enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gift_types' and policyname='Anyone can read active gift types') then
    create policy "Anyone can read active gift types" on public.gift_types for select using (active = true);
  end if;
end $$;

insert into public.gift_types (id, name, emoji, price_cents, score_value, sort_order) values
  ('fire',      'Fire',      '🔥',  99,   5,   1),
  ('lightning', 'Lightning', '⚡',  199,  12,  2),
  ('diamond',   'Diamond',   '💎',  499,  30,  3),
  ('crown',     'Crown',     '👑',  999,  75,  4),
  ('trophy',    'Trophy',    '🏆',  1999, 200, 5)
on conflict (id) do nothing;

create table if not exists public.user_gifts (
  id             uuid primary key default gen_random_uuid(),
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  gift_type_id   text not null references public.gift_types(id),
  message        text,
  created_at     timestamptz not null default now(),
  constraint no_self_gift check (sender_id <> recipient_id)
);

alter table public.user_gifts enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_gifts' and policyname='Anyone can see gifts received by a profile') then
    create policy "Anyone can see gifts received by a profile" on public.user_gifts for select using (true);
  end if;
end $$;

create index if not exists user_gifts_recipient_idx on public.user_gifts (recipient_id, created_at desc);
create index if not exists user_gifts_sender_idx    on public.user_gifts (sender_id,    created_at desc);

drop view if exists public.top_riders;

create view public.top_riders as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.is_premium,
  p.is_supporter,
  p.role,
  coalesce(fc.follower_count, 0)::int as follower_count,
  coalesce(lc.total_likes, 0)::int    as total_likes,
  coalesce(gc.gift_score, 0)::int     as gift_score,
  (
    coalesce(fc.follower_count, 0) * 2
    + coalesce(lc.total_likes, 0)
    + coalesce(gc.gift_score, 0)
  )::int as score
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
left join (
  select ug.recipient_id, sum(gt.score_value)::int as gift_score
  from public.user_gifts ug
  join public.gift_types gt on gt.id = ug.gift_type_id
  group by ug.recipient_id
) gc on gc.recipient_id = p.id
order by score desc;

grant select on public.top_riders to authenticated;
