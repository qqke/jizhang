create function public.jz_list_members(book uuid) returns table(user_id uuid, email text, joined_at timestamptz, is_owner boolean) language plpgsql security definer set search_path = '' as $$
begin
 if not jz_private.is_member(book) then raise exception 'Not a member'; end if;
 return query select m.user_id, u.email::text, m.joined_at, b.owner_id = m.user_id from public.jz_members m join public.jz_books b on b.id=m.book_id join auth.users u on u.id=m.user_id where m.book_id=book order by (b.owner_id = m.user_id) desc, m.joined_at;
end $$;
create function public.jz_remove_member(book uuid, member uuid) returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select owner_id into owner from public.jz_books where id=book;
 if owner is null or (auth.uid() <> owner and auth.uid() <> member) then raise exception 'Not authorized'; end if;
 if member = owner then raise exception 'Owner cannot leave'; end if;
 delete from public.jz_members where book_id=book and user_id=member;
end $$;
revoke all on function public.jz_list_members(uuid), public.jz_remove_member(uuid,uuid) from public, anon;
grant execute on function public.jz_list_members(uuid), public.jz_remove_member(uuid,uuid) to authenticated;
