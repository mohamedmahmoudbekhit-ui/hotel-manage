ALTER TABLE public.calendar_sources
  ADD COLUMN IF NOT EXISTS etag text,
  ADD COLUMN IF NOT EXISTS last_modified text,
  ADD COLUMN IF NOT EXISTS last_success_at timestamp with time zone;

ALTER TABLE public.ical_reservation_overrides
  ADD COLUMN IF NOT EXISTS channel_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.ical_reservation_overrides
  DROP CONSTRAINT IF EXISTS ical_reservation_overrides_status_check;

ALTER TABLE public.ical_reservation_overrides
  ADD CONSTRAINT ical_reservation_overrides_status_check
  CHECK (status IN ('active', 'noshow'));