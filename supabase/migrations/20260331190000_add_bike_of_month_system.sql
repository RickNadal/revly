-- Bike of the Month system

create table if not exists public.bike_of_month_cycles (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  unique (month_start)
);

create table if not exists public.bike_of_month_submissions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.bike_of_month_cycles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bike_name text not null,
  bike_photo_url text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (cycle_id, user_id)
);

create table if not exists public.bike_of_month_votes (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.bike_of_month_cycles(id) on delete cascade,
  submission_id uuid not null references public.bike_of_month_submissions(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (cycle_id, voter_id)
);

create table if not exists public.bike_of_month_boost_types (
  id text primary key,
  name text not null,
  emoji text not null,
  price_cents int not null,
  vote_points int not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create table if not exists public.bike_of_month_boosts (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.bike_of_month_cycles(id) on delete cascade,
  submission_id uuid not null references public.bike_of_month_submissions(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  boost_type_id text not null references public.bike_of_month_boost_types(id),
  message text,
  created_at timestamptz not null default now()
);

create or replace function public.botm_prevent_self_vote_or_boost()
returns trigger
language plpgsql
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id
  from public.bike_of_month_submissions
  where id = new.submission_id;

  if owner_id is null then
    raise exception 'Submission not found';
  end if;

  if TG_TABLE_NAME = 'bike_of_month_votes' and new.voter_id = owner_id then
    raise exception 'You cannot vote for your own bike';
  end if;

  if TG_TABLE_NAME = 'bike_of_month_boosts' and new.buyer_id = owner_id then
    raise exception 'You cannot boost your own bike';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_botm_no_self_vote on public.bike_of_month_votes;
create trigger trg_botm_no_self_vote
before insert on public.bike_of_month_votes
for each row execute function public.botm_prevent_self_vote_or_boost();

drop trigger if exists trg_botm_no_self_boost on public.bike_of_month_boosts;
create trigger trg_botm_no_self_boost
before insert on public.bike_of_month_boosts
for each row execute function public.botm_prevent_self_vote_or_boost();

alter table public.bike_of_month_cycles enable row level security;
alter table public.bike_of_month_submissions enable row level security;
alter table public.bike_of_month_votes enable row level security;
alter table public.bike_of_month_boost_types enable row level security;
alter table public.bike_of_month_boosts enable row level security;

-- read access
create policy "botm cycles are readable"
  on public.bike_of_month_cycles for select using (true);

create policy "botm submissions are readable"
  on public.bike_of_month_submissions for select using (true);

create policy "botm votes are readable"
  on public.bike_of_month_votes for select using (true);

create policy "botm boost types are readable"
  on public.bike_of_month_boost_types for select using (active = true);

create policy "botm boosts are readable"
  on public.bike_of_month_boosts for select using (true);

-- write access
create policy "users can submit their own bike"
  on public.bike_of_month_submissions for insert
  with check (auth.uid() = user_id);

create policy "users can vote"
  on public.bike_of_month_votes for insert
  with check (auth.uid() = voter_id);

create policy "users can buy boosts"
  on public.bike_of_month_boosts for insert
  with check (auth.uid() = buyer_id);

insert into public.bike_of_month_boost_types (id, name, emoji, price_cents, vote_points, sort_order)
values
  ('spark', 'Spark', '✨', 99, 1, 1),
  ('nitro', 'Nitro', '⚡', 299, 4, 2),
  ('crown', 'Crown', '👑', 699, 10, 3),
  ('trophy', 'Trophy', '🏆', 1499, 24, 4)
on conflict (id) do nothing;

insert into public.bike_of_month_cycles (month_start, status)
values (date_trunc('month', now())::date, 'open')
on conflict (month_start) do nothing;

create or replace view public.bike_of_month_submission_scores as
with regular_votes as (
  select submission_id, cycle_id, count(*)::int as regular_vote_count
  from public.bike_of_month_votes
  group by submission_id, cycle_id
),
boost_votes as (
  select b.submission_id, b.cycle_id, coalesce(sum(bt.vote_points), 0)::int as boost_points
  from public.bike_of_month_boosts b
  join public.bike_of_month_boost_types bt on bt.id = b.boost_type_id
  group by b.submission_id, b.cycle_id
)
select
  s.id as submission_id,
  s.cycle_id,
  s.user_id,
  s.bike_name,
  s.bike_photo_url,
  s.description,
  s.created_at,
  coalesce(rv.regular_vote_count, 0)::int as regular_vote_count,
  coalesce(bv.boost_points, 0)::int as boost_points,
  (coalesce(rv.regular_vote_count, 0) + coalesce(bv.boost_points, 0))::int as total_points
from public.bike_of_month_submissions s
left join regular_votes rv on rv.submission_id = s.id and rv.cycle_id = s.cycle_id
left join boost_votes bv on bv.submission_id = s.id and bv.cycle_id = s.cycle_id;

create or replace view public.bike_of_month_current_top3 as
with current_cycle as (
  select id
  from public.bike_of_month_cycles
  order by month_start desc
  limit 1
),
ranked as (
  select
    sc.user_id as rider_id,
    sc.submission_id,
    sc.total_points,
    row_number() over (order by sc.total_points desc, sc.created_at asc) as rank_position
  from public.bike_of_month_submission_scores sc
  join current_cycle cc on cc.id = sc.cycle_id
)
select *
from ranked
where rank_position <= 3;

grant select on public.bike_of_month_submission_scores to authenticated;
grant select on public.bike_of_month_current_top3 to authenticated;
