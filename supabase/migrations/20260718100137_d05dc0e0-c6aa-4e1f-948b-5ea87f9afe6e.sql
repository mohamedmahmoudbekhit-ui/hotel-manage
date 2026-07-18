
ALTER TABLE public.calendar_sources
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#64748b';

CREATE TABLE IF NOT EXISTS public.ical_reservation_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id UUID NOT NULL UNIQUE REFERENCES public.ical_reservations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  price NUMERIC,
  notes TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ical_reservation_overrides_org_idx
  ON public.ical_reservation_overrides(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ical_reservation_overrides TO authenticated;
GRANT ALL ON public.ical_reservation_overrides TO service_role;

ALTER TABLE public.ical_reservation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage ical overrides"
  ON public.ical_reservation_overrides
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_ical_reservation_overrides_updated_at
  BEFORE UPDATE ON public.ical_reservation_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
