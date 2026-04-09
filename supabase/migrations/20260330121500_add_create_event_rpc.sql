create or replace function public.create_event(
  p_title text,
  p_info text,
  p_event_type text,
  p_event_date date,
  p_event_time time,
  p_price_text text,
  p_location_text text,
  p_visibility text,
  p_invite_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_visibility text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_visibility := case when p_visibility = 'invite_only' then 'invite_only' else 'open' end;

  insert into public.events (
    creator_id,
    title,
    info,
    event_type,
    event_date,
    event_time,
    price_text,
    location_text,
    visibility,
    invite_code
  )
  values (
    auth.uid(),
    trim(coalesce(p_title, '')),
    nullif(trim(coalesce(p_info, '')), ''),
    trim(coalesce(p_event_type, '')),
    p_event_date,
    p_event_time,
    nullif(trim(coalesce(p_price_text, '')), ''),
    nullif(trim(coalesce(p_location_text, '')), ''),
    v_visibility,
    case when v_visibility = 'invite_only' then nullif(trim(coalesce(p_invite_code, '')), '') else null end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_event(text, text, text, date, time, text, text, text, text) from public;
grant execute on function public.create_event(text, text, text, date, time, text, text, text, text) to authenticated;
