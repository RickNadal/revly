alter table public.profiles
  add column if not exists premium_style text;

update public.profiles
set premium_style = coalesce(nullif(trim(premium_style), ''), 'classic');

alter table public.profiles
  alter column premium_style set default 'classic';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_premium_style_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_premium_style_check
      check (premium_style in ('classic', 'aurora', 'sunset', 'electric'));
  end if;
end $$;
