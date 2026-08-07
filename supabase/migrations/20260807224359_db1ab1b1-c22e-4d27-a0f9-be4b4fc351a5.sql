ALTER TABLE public.ical_reservation_overrides
  ADD COLUMN IF NOT EXISTS canceled_with_refund boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_direction text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric;

ALTER TABLE public.ical_reservation_overrides
  DROP CONSTRAINT IF EXISTS ical_reservation_overrides_refund_direction_check;

ALTER TABLE public.ical_reservation_overrides
  ADD CONSTRAINT ical_reservation_overrides_refund_direction_check
  CHECK (refund_direction IS NULL OR refund_direction IN ('to_guest','to_host'));