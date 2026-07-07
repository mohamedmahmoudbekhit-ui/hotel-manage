
CREATE TABLE public.hotel_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_name text NOT NULL DEFAULT '',
  onboarded boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_state TO authenticated;
GRANT ALL ON public.hotel_state TO service_role;

ALTER TABLE public.hotel_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own hotel state"
  ON public.hotel_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_hotel_state_updated_at
  BEFORE UPDATE ON public.hotel_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
