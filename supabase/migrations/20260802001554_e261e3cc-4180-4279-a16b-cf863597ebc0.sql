CREATE TABLE public.admin_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_recovery_codes_user_idx ON public.admin_recovery_codes(user_id);

GRANT ALL ON public.admin_recovery_codes TO service_role;

ALTER TABLE public.admin_recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.admin_recovery_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_admin_recovery_codes_updated_at
BEFORE UPDATE ON public.admin_recovery_codes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();