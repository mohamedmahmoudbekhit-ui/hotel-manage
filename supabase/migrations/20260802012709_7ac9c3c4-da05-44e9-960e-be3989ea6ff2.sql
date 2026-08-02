CREATE TABLE public.password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  token text,
  expires_at timestamptz,
  used_at timestamptz,
  issued_by uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin manages reset requests"
ON public.password_reset_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX password_reset_requests_token_idx ON public.password_reset_requests (token);

CREATE TRIGGER update_password_reset_requests_updated_at
BEFORE UPDATE ON public.password_reset_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();