revoke execute on function public.touch_presence(boolean) from public;
revoke execute on function public.touch_presence(boolean) from anon;
grant execute on function public.touch_presence(boolean) to authenticated;
