create or replace function public.events_set_creator_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  new.creator_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_events_set_creator_id on public.events;
create trigger trg_events_set_creator_id
before insert on public.events
for each row
execute function public.events_set_creator_id();

drop policy if exists events_insert_owner_or_staff on public.events;
create policy events_insert_authenticated
on public.events
for insert
to authenticated
with check (auth.uid() is not null);
