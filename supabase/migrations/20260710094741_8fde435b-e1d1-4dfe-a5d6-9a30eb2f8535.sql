
-- Extensions for scheduled sync
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rooms
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  room_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own rooms" ON public.rooms
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Calendar sources
CREATE TABLE public.calendar_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  platform_type text NOT NULL DEFAULT 'other',
  ical_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_sources TO authenticated;
GRANT ALL ON public.calendar_sources TO service_role;
ALTER TABLE public.calendar_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own calendar sources" ON public.calendar_sources
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX calendar_sources_room_id_idx ON public.calendar_sources (room_id);
CREATE INDEX calendar_sources_active_idx ON public.calendar_sources (is_active) WHERE is_active;
CREATE TRIGGER update_calendar_sources_updated_at BEFORE UPDATE ON public.calendar_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Imported reservations
CREATE TABLE public.ical_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.calendar_sources(id) ON DELETE CASCADE,
  platform_type text NOT NULL DEFAULT 'other',
  external_uid text NOT NULL,
  summary text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_uid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ical_reservations TO authenticated;
GRANT ALL ON public.ical_reservations TO service_role;
ALTER TABLE public.ical_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own ical reservations" ON public.ical_reservations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ical_reservations_room_dates_idx ON public.ical_reservations (room_id, start_date, end_date);
CREATE INDEX ical_reservations_user_idx ON public.ical_reservations (user_id);
CREATE TRIGGER update_ical_reservations_updated_at BEFORE UPDATE ON public.ical_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
