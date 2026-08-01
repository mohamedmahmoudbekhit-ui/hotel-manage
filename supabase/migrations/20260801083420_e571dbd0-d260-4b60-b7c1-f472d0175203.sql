CREATE OR REPLACE FUNCTION public.ensure_super_admin_self()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  _email text;
  _uid uuid := auth.uid();
begin
  if _uid is null then
    return false;
  end if;
  select lower(email) into _email from auth.users where id = _uid;
  if _email is null then
    return false;
  end if;
  if not exists (select 1 from public.super_admin_emails where lower(email) = _email) then
    return exists (select 1 from public.user_roles where user_id = _uid and role = 'super_admin');
  end if;
  insert into public.user_roles(user_id, role) values (_uid, 'super_admin')
  on conflict (user_id, role) do nothing;
  return true;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_super_admin_self() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_super_admin_self() TO authenticated, service_role;