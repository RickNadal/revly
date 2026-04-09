-- Add DELETE policy for users to remove their own votes

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bike_of_month_votes'
      and policyname = 'users can delete their own votes'
  ) then
    create policy "users can delete their own votes"
      on public.bike_of_month_votes
      for delete
      using (auth.uid() = voter_id);
  end if;
end $$;
