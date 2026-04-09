do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ad_campaigns'
      and policyname = 'ad_campaigns_read_mod_admin'
  ) then
    create policy "ad_campaigns_read_mod_admin"
      on public.ad_campaigns
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('moderator', 'admin')
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ad_campaigns'
      and policyname = 'ad_campaigns_update_mod_admin'
  ) then
    create policy "ad_campaigns_update_mod_admin"
      on public.ad_campaigns
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('moderator', 'admin')
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('moderator', 'admin')
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ad_events'
      and policyname = 'ad_events_read_mod_admin'
  ) then
    create policy "ad_events_read_mod_admin"
      on public.ad_events
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('moderator', 'admin')
        )
      );
  end if;
end
$$;

grant select, update on public.ad_campaigns to authenticated;
grant select on public.ad_events to authenticated;
