-- Rewards and Hall of Fame for Bike of the Month

alter table public.profiles
  add column if not exists botm_wins_count int not null default 0,
  add column if not exists botm_champion_until timestamptz,
  add column if not exists botm_spotlight_until timestamptz,
  add column if not exists botm_premium_until timestamptz;

create table if not exists public.bike_of_month_winner_history (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.bike_of_month_cycles(id) on delete cascade,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  rank_position int not null check (rank_position between 1 and 3),
  total_points int not null default 0,
  created_at timestamptz not null default now(),
  unique (cycle_id, rank_position),
  unique (cycle_id, rider_id)
);

alter table public.bike_of_month_winner_history enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='bike_of_month_winner_history' and policyname='botm winner history readable'
  ) then
    create policy "botm winner history readable"
      on public.bike_of_month_winner_history for select using (true);
  end if;
end $$;

create or replace function public.finalize_bike_of_month_cycle(p_cycle_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_id uuid;
  v_month_start date;
  v_next_month date;
  v_requester_role text;
begin
  -- admin only
  select role into v_requester_role
  from public.profiles
  where id = auth.uid();

  if coalesce(v_requester_role, 'user') <> 'admin' then
    raise exception 'Only admin can finalize Bike of the Month';
  end if;

  if p_cycle_id is null then
    select id, month_start into v_cycle_id, v_month_start
    from public.bike_of_month_cycles
    where status = 'open'
    order by month_start desc
    limit 1;
  else
    select id, month_start into v_cycle_id, v_month_start
    from public.bike_of_month_cycles
    where id = p_cycle_id
    limit 1;
  end if;

  if v_cycle_id is null then
    raise exception 'No cycle found';
  end if;

  -- store top-3 in history (idempotent by unique constraints)
  insert into public.bike_of_month_winner_history (cycle_id, rider_id, rank_position, total_points)
  select
    ranked.cycle_id,
    ranked.rider_id,
    ranked.rank_position,
    ranked.total_points
  from (
    select
      sc.cycle_id,
      sc.user_id as rider_id,
      sc.total_points,
      row_number() over (order by sc.total_points desc, sc.created_at asc) as rank_position
    from public.bike_of_month_submission_scores sc
    where sc.cycle_id = v_cycle_id
  ) ranked
  where ranked.rank_position <= 3
  on conflict (cycle_id, rank_position)
  do update set
    rider_id = excluded.rider_id,
    total_points = excluded.total_points;

  -- reward #1: winner gets one-month premium + champion/spotlight
  update public.profiles p
  set
    is_premium = true,
    botm_premium_until = greatest(coalesce(p.botm_premium_until, now()), now() + interval '1 month'),
    botm_champion_until = greatest(coalesce(p.botm_champion_until, now()), now() + interval '1 month'),
    botm_spotlight_until = greatest(coalesce(p.botm_spotlight_until, now()), now() + interval '1 month'),
    botm_wins_count = p.botm_wins_count + 1
  where p.id in (
    select h.rider_id
    from public.bike_of_month_winner_history h
    where h.cycle_id = v_cycle_id
      and h.rank_position = 1
  );

  -- close cycle
  update public.bike_of_month_cycles
  set status = 'closed'
  where id = v_cycle_id;

  -- open next month cycle if missing
  v_next_month := (date_trunc('month', v_month_start::timestamp + interval '1 month'))::date;
  insert into public.bike_of_month_cycles (month_start, status)
  values (v_next_month, 'open')
  on conflict (month_start) do nothing;

  return jsonb_build_object(
    'ok', true,
    'cycle_id', v_cycle_id,
    'next_month', v_next_month
  );
end;
$$;

grant execute on function public.finalize_bike_of_month_cycle(uuid) to authenticated;
