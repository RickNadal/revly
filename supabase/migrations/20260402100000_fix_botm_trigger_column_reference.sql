-- Fix: Split BOTM trigger into two separate functions to avoid column reference errors

-- Drop the old triggers
drop trigger if exists trg_botm_no_self_vote on public.bike_of_month_votes;
drop trigger if exists trg_botm_no_self_boost on public.bike_of_month_boosts;

-- Drop the old shared function
drop function if exists public.botm_prevent_self_vote_or_boost();

-- Create separate trigger function for votes
create or replace function public.botm_prevent_self_vote()
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

  if new.voter_id = owner_id then
    raise exception 'You cannot vote for your own bike';
  end if;

  return new;
end;
$$;

-- Create separate trigger function for boosts
create or replace function public.botm_prevent_self_boost()
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

  if new.buyer_id = owner_id then
    raise exception 'You cannot boost your own bike';
  end if;

  return new;
end;
$$;

-- Recreate triggers with proper functions
create trigger trg_botm_no_self_vote
before insert on public.bike_of_month_votes
for each row execute function public.botm_prevent_self_vote();

create trigger trg_botm_no_self_boost
before insert on public.bike_of_month_boosts
for each row execute function public.botm_prevent_self_boost();
