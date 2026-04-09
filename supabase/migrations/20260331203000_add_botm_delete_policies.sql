do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bike_of_month_submissions'
      and policyname = 'users can delete their own botm submission'
  ) then
    create policy "users can delete their own botm submission"
      on public.bike_of_month_submissions
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bike_of_month_submissions'
      and policyname = 'admins can delete any botm submission'
  ) then
    create policy "admins can delete any botm submission"
      on public.bike_of_month_submissions
      for delete
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      );
  end if;
end $$;
