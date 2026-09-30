revoke execute on function public.join_random_queue() from anon;
revoke execute on function public.leave_random_queue() from anon;
revoke execute on function public.get_or_create_direct_room(uuid) from anon;
revoke execute on function public.is_room_member(uuid) from anon;
revoke execute on function public.touch_presence(boolean) from anon;

grant execute on function public.join_random_queue() to authenticated;
grant execute on function public.leave_random_queue() to authenticated;
grant execute on function public.get_or_create_direct_room(uuid) to authenticated;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.touch_presence(boolean) to authenticated;
