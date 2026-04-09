-- Allow BOTM finalize function to run from both admin UI and service/cron contexts.
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
  v_uid uuid;
begin
  v_uid := auth.uid();

  -- Admin check only when called by an authenticated user context.
  -- Service/cron contexts (auth.uid is null) are allowed.
  if v_uid is not null then
    select role into v_requester_role
    from public.profiles
    where id = v_uid;

    if coalesce(v_requester_role, 'user') <> 'admin' then
      raise exception 'Only admin can finalize Bike of the Month';
    end if;
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

  update public.bike_of_month_cycles
  set status = 'closed'
  where id = v_cycle_id;

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

-- Automatic rollover entrypoint (safe to run daily)
create or replace function public.botm_auto_rollover()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_month date := date_trunc('month', now())::date;
  v_open_id uuid;
  v_open_month date;
  v_processed int := 0;
begin
  -- finalize all overdue open cycles (if app was offline/missed months)
  loop
    select id, month_start into v_open_id, v_open_month
    from public.bike_of_month_cycles
    where status = 'open'
    order by month_start asc
    limit 1;

    exit when v_open_id is null;
    exit when v_open_month >= v_current_month;

    perform public.finalize_bike_of_month_cycle(v_open_id);
    v_processed := v_processed + 1;
  end loop;

  -- ensure current month cycle exists and is open
  insert into public.bike_of_month_cycles (month_start, status)
  values (v_current_month, 'open')
  on conflict (month_start) do nothing;

  return jsonb_build_object(
    'ok', true,
    'processed_cycles', v_processed,
    'current_month', v_current_month
  );
end;
$$;

grant execute on function public.botm_auto_rollover() to authenticated;

-- Schedule daily auto-rollover if pg_cron is available.
do $$
declare
  v_has_cron boolean := false;
  v_exists boolean := false;
begin
  v_has_cron := (to_regnamespace('cron') is not null) and (to_regclass('cron.job') is not null);
  if not v_has_cron then
    return;
  end if;

  execute 'select exists(select 1 from cron.job where jobname = ''botm-auto-rollover-daily'')' into v_exists;

  if not v_exists then
    begin
      perform cron.schedule(
        'botm-auto-rollover-daily',
        '5 0 * * *',
        $cmd$select public.botm_auto_rollover();$cmd$
      );
    exception
      when undefined_function then
        -- older pg_cron signatures without job name
        perform cron.schedule('5 0 * * *', $cmd$select public.botm_auto_rollover();$cmd$);
    end;
  end if;
end $$;
