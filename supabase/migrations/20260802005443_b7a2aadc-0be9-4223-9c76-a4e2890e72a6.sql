-- Scope the two RLS helper functions to the caller.
-- They must remain EXECUTE-able by `authenticated` because RLS policies
-- evaluate with the caller's privileges, but they should not act as an
-- oracle for other users' roles / memberships.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select case
    -- Trusted server contexts (service_role, triggers) have no auth.uid().
    when auth.uid() is null or _user_id = auth.uid() then exists (
      select 1 from public.user_roles where user_id = _user_id and role = _role
    )
    else false
  end
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select case
    when auth.uid() is null or _user_id = auth.uid() then exists (
      select 1 from public.organization_members
      where user_id = _user_id and organization_id = _org_id and status = 'active'
    )
    else false
  end
$function$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ensure_super_admin_self() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_super_admin_self() TO authenticated, service_role;