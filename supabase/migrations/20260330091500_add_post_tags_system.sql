create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag text not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint post_tags_tag_format check (tag ~ '^[a-z0-9_]{2,30}$'),
  constraint post_tags_pk primary key (post_id, tag)
);

create index if not exists post_tags_tag_idx on public.post_tags(tag);
create index if not exists post_tags_post_id_idx on public.post_tags(post_id);

alter table public.post_tags enable row level security;

drop policy if exists post_tags_select_authenticated on public.post_tags;
create policy post_tags_select_authenticated
on public.post_tags
for select
to authenticated
using (true);

drop policy if exists post_tags_insert_own_post on public.post_tags;
create policy post_tags_insert_own_post
on public.post_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists post_tags_delete_own_post on public.post_tags;
create policy post_tags_delete_own_post
on public.post_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.user_id = auth.uid()
  )
);

create or replace function public.sync_post_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m text[];
  normalized_tag text;
begin
  delete from public.post_tags where post_id = new.id;

  for m in
    select regexp_matches(lower(coalesce(new.caption, '')), '#([a-z0-9_]{2,30})', 'g')
  loop
    normalized_tag := m[1];
    if normalized_tag is not null and normalized_tag <> '' then
      insert into public.post_tags (post_id, tag, created_by)
      values (new.id, normalized_tag, new.user_id)
      on conflict (post_id, tag) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_sync_post_tags on public.posts;
create trigger trg_sync_post_tags
after insert or update of caption
on public.posts
for each row
execute function public.sync_post_tags();

insert into public.post_tags (post_id, tag, created_by)
select p.id, lower((m)[1]) as tag, p.user_id
from public.posts p
cross join lateral regexp_matches(lower(coalesce(p.caption, '')), '#([a-z0-9_]{2,30})', 'g') as m
on conflict (post_id, tag) do nothing;
