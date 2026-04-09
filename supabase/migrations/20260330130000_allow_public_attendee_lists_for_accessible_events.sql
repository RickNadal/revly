drop policy if exists event_attendees_select_related on public.event_attendees;

create policy event_attendees_select_accessible_events
on public.event_attendees
for select
to authenticated
using (
  public.can_access_event(event_id, auth.uid())
  or public.is_admin_or_moderator(auth.uid())
);
