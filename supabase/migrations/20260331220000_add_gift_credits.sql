-- ─────────────────────────────────────────────
-- Gift Credits: let users earn free 🔥 Fire gifts
-- ─────────────────────────────────────────────

-- 1. Add credit columns to profiles
alter table public.profiles
  add column if not exists gift_credits int not null default 0,
  add column if not exists last_gift_credit_claimed_at timestamptz;

-- 2. RPC: claim daily gift credit (one per 24 h)
create or replace function public.claim_daily_gift_credit()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_last     timestamptz;
  v_credits  int;
begin
  if v_user_id is null then
    return json_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select gift_credits, last_gift_credit_claimed_at
  into   v_credits, v_last
  from   public.profiles
  where  id = v_user_id;

  if v_last is not null and v_last > now() - interval '24 hours' then
    return json_build_object(
      'ok', false,
      'error', 'Already claimed today',
      'next_claim_at', (v_last + interval '24 hours')
    );
  end if;

  update public.profiles
  set    gift_credits                = gift_credits + 1,
         last_gift_credit_claimed_at = now()
  where  id = v_user_id;

  return json_build_object('ok', true, 'credits', v_credits + 1);
end;
$$;

grant execute on function public.claim_daily_gift_credit() to authenticated;

-- 3. RPC: spend a gift credit → sends 🔥 Fire to recipient
create or replace function public.spend_gift_credit(p_recipient_id uuid, p_message text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_credits int;
begin
  if v_user_id is null then
    return json_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  if v_user_id = p_recipient_id then
    return json_build_object('ok', false, 'error', 'Cannot send gift to yourself');
  end if;

  -- Lock row to prevent race-condition double-spend
  select gift_credits into v_credits
  from   public.profiles
  where  id = v_user_id
  for update;

  if v_credits is null or v_credits < 1 then
    return json_build_object('ok', false, 'error', 'Not enough credits');
  end if;

  update public.profiles
  set gift_credits = gift_credits - 1
  where id = v_user_id;

  insert into public.user_gifts (sender_id, recipient_id, gift_type_id, message)
  values (v_user_id, p_recipient_id, 'fire', p_message);

  return json_build_object('ok', true, 'credits_remaining', v_credits - 1);
end;
$$;

grant execute on function public.spend_gift_credit(uuid, text) to authenticated;
