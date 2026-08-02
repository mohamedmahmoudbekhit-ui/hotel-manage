CREATE TABLE public.calendar_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.calendar_sources(id) on delete cascade,
  status text not null default 'success',
  events_found integer not null default 0,
  imported integer not null default 0,
  removed integer not null default 0,
  duration_ms integer not null default 0,
  error_message text,
  trigger_source text not null default 'manual',
  created_at timestamptz not null default now()
);

GRANT SELECT ON public.calendar_sync_logs TO authenticated;
GRANT ALL ON public.calendar_sync_logs TO service_role;

ALTER TABLE public.calendar_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read sync logs" ON public.calendar_sync_logs
FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX calendar_sync_logs_source_idx ON public.calendar_sync_logs (source_id, created_at DESC);