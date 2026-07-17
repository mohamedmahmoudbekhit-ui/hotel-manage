
-- 1) Switch security-definer helpers used from RLS to SECURITY INVOKER.
--    Every call site passes auth.uid() and reads only rows the caller can already see under RLS.
ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.is_org_member(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.current_org_id(uuid) SECURITY INVOKER;

-- 2) Trigger-only helpers: keep SECURITY DEFINER but revoke direct EXECUTE from clients.
--    Triggers invoke them internally without needing EXECUTE on the caller role.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_super_admin_if_seeded() FROM PUBLIC, anon, authenticated;

-- 3) Organization invitations: allow org members to read and create invitations for their own org.
DROP POLICY IF EXISTS "members read own org invitations" ON public.organization_invitations;
CREATE POLICY "members read own org invitations"
  ON public.organization_invitations FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "members create own org invitations" ON public.organization_invitations;
CREATE POLICY "members create own org invitations"
  ON public.organization_invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "members update own org invitations" ON public.organization_invitations;
CREATE POLICY "members update own org invitations"
  ON public.organization_invitations FOR UPDATE
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

-- 4) Storage policies for the private hotel-logos bucket.
--    Files must be stored under "<organization_id>/..." and are readable/writable
--    only by active members of that organization.
DROP POLICY IF EXISTS "hotel-logos: members read own org files" ON storage.objects;
CREATE POLICY "hotel-logos: members read own org files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'hotel-logos'
    AND public.is_org_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "hotel-logos: members insert own org files" ON storage.objects;
CREATE POLICY "hotel-logos: members insert own org files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-logos'
    AND public.is_org_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "hotel-logos: members update own org files" ON storage.objects;
CREATE POLICY "hotel-logos: members update own org files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hotel-logos'
    AND public.is_org_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  )
  WITH CHECK (
    bucket_id = 'hotel-logos'
    AND public.is_org_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "hotel-logos: members delete own org files" ON storage.objects;
CREATE POLICY "hotel-logos: members delete own org files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hotel-logos'
    AND public.is_org_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
