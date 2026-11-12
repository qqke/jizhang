alter table public.jz_transactions
  add column if not exists merchant text not null default '' check (char_length(merchant) <= 100);

create or replace function public.jz_list_merchants(book uuid)
returns text[]
language sql stable security invoker set search_path = ''
as $$
  select coalesce(array_agg(distinct merchant order by merchant), array[]::text[])
  from public.jz_transactions
  where book_id = book and merchant <> '';
$$;

revoke all on function public.jz_list_merchants(uuid) from public, anon;
grant execute on function public.jz_list_merchants(uuid) to authenticated;
