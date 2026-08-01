-- 1) Scoped DELETE policy for organization_invitations
DROP POLICY IF EXISTS "members delete own org invitations" ON public.organization_invitations;
CREATE POLICY "members delete own org invitations"
ON public.organization_invitations
FOR DELETE
TO authenticated
USING (public.is_org_member(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2) Remove anonymous read access to subscription plan pricing
DROP POLICY IF EXISTS "read active plans" ON public.subscription_plans;
CREATE POLICY "read active plans"
ON public.subscription_plans
FOR SELECT
TO authenticated
USING (is_active = true OR public.has_role(auth.uid(), 'super_admin'::app_role));

REVOKE SELECT ON public.subscription_plans FROM anon;
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;