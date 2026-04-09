create or replace function public.is_admin_or_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('admin', 'moderator')
  );
$$;

create or replace function public.is_event_creator(p_event_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.creator_id = uid
  );
$$;

create or replace function public.is_event_member(p_event_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_attendees ea
    where ea.event_id = p_event_id
      and ea.user_id = uid
  );
$$;

create or replace function public.can_access_event(p_event_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        e.visibility = 'open'
        or e.creator_id = uid
        or public.is_admin_or_moderator(uid)
        or public.is_event_member(e.id, uid)
      )
  );
$$;

create or replace function public.can_join_event(p_event_id uuid, uid uuid, p_invite_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        public.is_admin_or_moderator(uid)
        or e.creator_id = uid
        or e.visibility = 'open'
        or (e.visibility = 'invite_only' and coalesce(e.invite_code, '') = coalesce(p_invite_code, ''))
      )
  );
$$;

drop policy if exists events_select_accessible on public.events;
create policy events_select_accessible
on public.events
for select
to authenticated
using (public.can_access_event(id, auth.uid()));

drop policy if exists events_insert_owner_or_staff on public.events;
create policy events_insert_owner_or_staff
on public.events
for insert
to authenticated
with check (
  creator_id = auth.uid()
  or public.is_admin_or_moderator(auth.uid())
);

drop policy if exists events_update_owner_or_staff on public.events;
create policy events_update_owner_or_staff
on public.events
for update
to authenticated
using (
  creator_id = auth.uid()
  or public.is_admin_or_moderator(auth.uid())
)
with check (
  creator_id = auth.uid()
  or public.is_admin_or_moderator(auth.uid())
);

drop policy if exists events_delete_owner_or_staff on public.events;
create policy events_delete_owner_or_staff
on public.events
for delete
to authenticated
using (
  creator_id = auth.uid()
  or public.is_admin_or_moderator(auth.uid())
);

drop policy if exists event_media_select_accessible on public.event_media;
create policy event_media_select_accessible
on public.event_media
for select
to authenticated
using (public.can_access_event(event_id, auth.uid()));

drop policy if exists event_media_insert_owner_or_staff on public.event_media;
create policy event_media_insert_owner_or_staff
on public.event_media
for insert
to authenticated
with check (
  public.is_event_creator(event_id, auth.uid())
  or public.is_admin_or_moderator(auth.uid())
);

drop policy if exists event_media_delete_owner_or_staff on public.event_media;
create policy event_media_delete_owner_or_staff
on public.event_media
for delete
to authenticated
using (
  public.is_event_creator(event_id, auth.uid())
  or public.is_admin_or_moderator(auth.uid())
);

drop policy if exists event_attendees_select_related on public.event_attendees;
create policy event_attendees_select_related
on public.event_attendees
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_or_moderator(auth.uid())
  or public.is_event_creator(event_id, auth.uid())
);

drop policy if exists event_attendees_insert_join_or_staff on public.event_attendees;
create policy event_attendees_insert_join_or_staff
on public.event_attendees
for insert
to authenticated
with check (
  public.is_admin_or_moderator(auth.uid())
  or (
    user_id = auth.uid()
    and public.can_join_event(event_id, auth.uid(), invite_code)
  )
);

drop policy if exists event_attendees_delete_self_or_staff on public.event_attendees;
create policy event_attendees_delete_self_or_staff
on public.event_attendees
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_or_moderator(auth.uid())
  or public.is_event_creator(event_id, auth.uid())
);
