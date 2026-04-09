do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ad_campaigns'
      and policyname = 'ad_campaigns_insert_mod_admin'
  ) then
    create policy "ad_campaigns_insert_mod_admin"
      on public.ad_campaigns
      for insert
      to authenticated
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

grant insert on public.ad_campaigns to authenticated;