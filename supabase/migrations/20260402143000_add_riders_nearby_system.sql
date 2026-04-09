-- Riders Near Me: opt-in presence + consent-gated contact requests

create table if not exists public.rider_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  lat_approx double precision,
  lng_approx double precision,
  precision_m int not null default 1000,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (enabled = false) or (lat_approx is not null and lng_approx is not null)
  )
);

create index if not exists idx_rider_presence_enabled_updated
  on public.rider_presence(enabled, updated_at desc);

create index if not exists idx_rider_presence_lat_lng
  on public.rider_presence(lat_approx, lng_approx)
  where enabled = true;

alter table public.rider_presence enable row level security;

create table if not exists public.rider_contact_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'denied', 'expired', 'blocked')),
  message text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  check (sender_id <> receiver_id)
);

create index if not exists idx_rider_contact_requests_receiver_status
  on public.rider_contact_requests(receiver_id, status, created_at desc);

create index if not exists idx_rider_contact_requests_sender_receiver_created
  on public.rider_contact_requests(sender_id, receiver_id, created_at desc);

create unique index if not exists uq_rider_contact_requests_one_pending_pair
  on public.rider_contact_requests(sender_id, receiver_id)
  where status = 'pending';

alter table public.rider_contact_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rider_presence' and policyname = 'rider_presence_select_enabled'
  ) then
    create policy "rider_presence_select_enabled"
      on public.rider_presence for select
      to authenticated
      using (enabled = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rider_presence' and policyname = 'rider_presence_select_own'
  ) then
    create policy "rider_presence_select_own"
      on public.rider_presence for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rider_presence' and policyname = 'rider_presence_insert_own'
  ) then
    create policy "rider_presence_insert_own"
      on public.rider_presence for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rider_presence' and policyname = 'rider_presence_update_own'
  ) then
    create policy "rider_presence_update_own"
      on public.rider_presence for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rider_contact_requests' and policyname = 'rider_contact_requests_select_participants'
  ) then
    create policy "rider_contact_requests_select_participants"
      on public.rider_contact_requests for select
      to authenticated
      using (auth.uid() = sender_id or auth.uid() = receiver_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rider_contact_requests' and policyname = 'rider_contact_requests_insert_sender'
  ) then
    create policy "rider_contact_requests_insert_sender"
      on public.rider_contact_requests for insert
      to authenticated
      with check (auth.uid() = sender_id and status = 'pending');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rider_contact_requests' and policyname = 'rider_contact_requests_update_receiver'
  ) then
    create policy "rider_contact_requests_update_receiver"
      on public.rider_contact_requests for update
      to authenticated
      using (auth.uid() = receiver_id)
      with check (auth.uid() = receiver_id);
  end if;
end $$;

create or replace function public.set_rider_nearby_presence(
  p_enabled boolean,
  p_lat double precision default null,
  p_lng double precision default null,
  p_precision_m int default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_lat double precision;
  v_lng double precision;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_enabled then
    if p_lat is null or p_lng is null then
      raise exception 'Location required when enabling Rider Near Me';
    end if;

    -- Approximate location to reduce exact tracking risk.
    v_lat := round(p_lat::numeric, 2)::double precision;
    v_lng := round(p_lng::numeric, 2)::double precision;

    insert into public.rider_presence (user_id, enabled, lat_approx, lng_approx, precision_m, last_seen_at, updated_at)
    values (v_user_id, true, v_lat, v_lng, greatest(coalesce(p_precision_m, 1000), 100), now(), now())
    on conflict (user_id)
    do update set
      enabled = true,
      lat_approx = excluded.lat_approx,
      lng_approx = excluded.lng_approx,
      precision_m = excluded.precision_m,
      last_seen_at = now(),
      updated_at = now();
  else
    insert into public.rider_presence (user_id, enabled, lat_approx, lng_approx, precision_m, last_seen_at, updated_at)
    values (v_user_id, false, null, null, greatest(coalesce(p_precision_m, 1000), 100), now(), now())
    on conflict (user_id)
    do update set
      enabled = false,
      lat_approx = null,
      lng_approx = null,
      precision_m = excluded.precision_m,
      last_seen_at = now(),
      updated_at = now();
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_rider_nearby_presence(boolean, double precision, double precision, int) to authenticated;

create or replace function public.get_nearby_riders(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 80,
  p_limit int default 200
)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  bio text,
  lat_approx double precision,
  lng_approx double precision,
  distance_km double precision,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    rp.user_id,
    coalesce(p.full_name, 'Rider') as full_name,
    p.avatar_url,
    p.bio,
    rp.lat_approx,
    rp.lng_approx,
    (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(rp.lat_approx)) * cos(radians(rp.lng_approx) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(rp.lat_approx))
      )
    )::double precision as distance_km,
    rp.last_seen_at
  from public.rider_presence rp
  join public.profiles p on p.id = rp.user_id
  join me on true
  where rp.enabled = true
    and rp.user_id <> me.uid
    and not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = me.uid and b.blocked_id = rp.user_id)
         or (b.blocker_id = rp.user_id and b.blocked_id = me.uid)
    )
    and (
      6371 * acos(
        cos(radians(p_lat)) * cos(radians(rp.lat_approx)) * cos(radians(rp.lng_approx) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(rp.lat_approx))
      )
    ) <= greatest(coalesce(p_radius_km, 80), 1)
  order by distance_km asc, rp.updated_at desc
  limit greatest(coalesce(p_limit, 200), 1);
$$;

grant execute on function public.get_nearby_riders(double precision, double precision, double precision, int) to authenticated;

create or replace function public.send_rider_contact_request(
  p_receiver_id uuid,
  p_message text default null,
  p_cooldown_hours int default 24
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_last_created_at timestamptz;
  v_existing_pending uuid;
  v_receiver_enabled boolean;
  v_cooldown interval := make_interval(hours => greatest(coalesce(p_cooldown_hours, 24), 1));
  v_request_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_receiver_id is null then
    raise exception 'Receiver is required';
  end if;

  if p_receiver_id = v_sender_id then
    raise exception 'You cannot send a request to yourself';
  end if;

  select enabled into v_receiver_enabled
  from public.rider_presence
  where user_id = p_receiver_id;

  if coalesce(v_receiver_enabled, false) = false then
    raise exception 'This rider is not accepting nearby requests right now';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_sender_id and b.blocked_id = p_receiver_id)
       or (b.blocker_id = p_receiver_id and b.blocked_id = v_sender_id)
  ) then
    raise exception 'Unable to send request to this rider';
  end if;

  select r.id into v_existing_pending
  from public.rider_contact_requests r
  where r.sender_id = v_sender_id
    and r.receiver_id = p_receiver_id
    and r.status = 'pending'
  order by r.created_at desc
  limit 1;

  if v_existing_pending is not null then
    raise exception 'You already have a pending request for this rider';
  end if;

  select r.created_at into v_last_created_at
  from public.rider_contact_requests r
  where r.sender_id = v_sender_id
    and r.receiver_id = p_receiver_id
  order by r.created_at desc
  limit 1;

  if v_last_created_at is not null and now() < (v_last_created_at + v_cooldown) then
    raise exception 'Please wait before sending another request to this rider';
  end if;

  insert into public.rider_contact_requests (sender_id, receiver_id, status, message)
  values (v_sender_id, p_receiver_id, 'pending', nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.send_rider_contact_request(uuid, text, int) to authenticated;

create or replace function public.decide_rider_contact_request(
  p_request_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next_status text;
  v_sender_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_next_status := lower(trim(coalesce(p_decision, '')));
  if v_next_status not in ('accepted', 'denied') then
    raise exception 'Decision must be accepted or denied';
  end if;

  update public.rider_contact_requests r
  set
    status = v_next_status,
    decided_at = now(),
    decided_by = v_user_id
  where r.id = p_request_id
    and r.receiver_id = v_user_id
    and r.status = 'pending'
  returning r.sender_id into v_sender_id;

  if v_sender_id is null then
    raise exception 'Request not found or already handled';
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_next_status,
    'sender_id', v_sender_id
  );
end;
$$;

grant execute on function public.decide_rider_contact_request(uuid, text) to authenticated;
