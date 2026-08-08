ALTER TABLE public.ical_reservation_overrides DROP CONSTRAINT IF EXISTS ical_reservation_overrides_status_check;

UPDATE public.ical_reservation_overrides
SET status = 'refunded'
WHERE canceled_with_refund = true AND status <> 'refunded';

ALTER TABLE public.ical_reservation_overrides
  ADD CONSTRAINT ical_reservation_overrides_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'noshow'::text, 'canceled'::text, 'refunded'::text]));