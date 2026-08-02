-- Invitation rows contain one-time tokens. All hotel-side invite flows run through
-- trusted server code (service role) with explicit hotel-owner checks, so no direct
-- org-member access is needed. Only super admins keep direct access.
DROP POLICY IF EXISTS "members read own org invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "members create own org invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "members update own org invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "members delete own org invitations" ON public.organization_invitations;