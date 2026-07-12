
-- Drop old per-user policies first (they reference user_id)
drop policy if exists "Users manage their own hotel state" on public.hotel_state;
drop policy if exists "Users manage their own rooms" on public.rooms;
drop policy if exists "Users manage their own calendar sources" on public.calendar_sources;
drop policy if exists "Users manage their own ical reservations" on public.ical_reservations;

-- Wipe existing tenant data
truncate table public.ical_reservations, public.calendar_sources, public.rooms, public.hotel_state restart identity cascade;

-- Roles
create type public.app_role as enum ('super_admin', 'hotel_admin', 'hotel_staff');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create policy "super admin manages roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

create table public.super_admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);
grant select on public.super_admin_emails to authenticated;
grant all on public.super_admin_emails to service_role;
alter table public.super_admin_emails enable row level security;
create policy "super admin reads seed" on public.super_admin_emails for select to authenticated
  using (public.has_role(auth.uid(),'super_admin'));
insert into public.super_admin_emails(email) values ('mohamedmahmoudbekhit@gmail.com') on conflict do nothing;

create or replace function public.grant_super_admin_if_seeded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null
     and exists (select 1 from public.super_admin_emails where lower(email) = lower(new.email)) then
    insert into public.user_roles(user_id, role) values (new.id, 'super_admin') on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_super_admin after insert on auth.users
for each row execute function public.grant_super_admin_if_seeded();
create trigger on_auth_user_confirmed_super_admin after update of email_confirmed_at on auth.users
for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.grant_super_admin_if_seeded();

-- Plans
create table public.subscription_plans (
  code text primary key,
  name text not null,
  monthly_price_cents integer not null default 0,
  trial_days integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.subscription_plans to authenticated, anon;
grant all on public.subscription_plans to service_role;
alter table public.subscription_plans enable row level security;
create policy "read active plans" on public.subscription_plans for select
  using (is_active = true or public.has_role(auth.uid(),'super_admin'));
create policy "super admin manages plans" on public.subscription_plans for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
insert into public.subscription_plans(code,name,monthly_price_cents,trial_days,sort_order) values
  ('trial','Trial',0,14,0),('basic','Basic',2900,0,1),('pro','Pro',7900,0,2),('enterprise','Enterprise',0,0,3)
on conflict do nothing;

-- Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  hotel_name text not null,
  logo_url text,
  contact_person text,
  contact_email text not null,
  contact_mobile text not null,
  subscription_plan text not null default 'trial' references public.subscription_plans(code),
  subscription_status text not null default 'trial' check (subscription_status in ('trial','active','expired','suspended','cancelled')),
  account_status text not null default 'active' check (account_status in ('active','suspended')),
  start_date date not null default current_date,
  renewal_date date,
  expiry_date date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'hotel_admin' check (role in ('hotel_admin','hotel_staff')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  unique(organization_id, user_id)
);
grant select, insert, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;
alter table public.organization_members enable row level security;

create or replace function public.is_org_member(_user_id uuid, _org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where user_id = _user_id and organization_id = _org_id and status = 'active')
$$;

create or replace function public.current_org_id(_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.organization_members
  where user_id = _user_id and status = 'active' order by created_at asc limit 1
$$;

create policy "read own org" on public.organizations for select to authenticated
  using (public.is_org_member(auth.uid(), id) or public.has_role(auth.uid(),'super_admin'));
create policy "update own org" on public.organizations for update to authenticated
  using (public.is_org_member(auth.uid(), id) or public.has_role(auth.uid(),'super_admin'))
  with check (public.is_org_member(auth.uid(), id) or public.has_role(auth.uid(),'super_admin'));
create policy "super admin inserts orgs" on public.organizations for insert to authenticated
  with check (public.has_role(auth.uid(),'super_admin'));
create policy "super admin deletes orgs" on public.organizations for delete to authenticated
  using (public.has_role(auth.uid(),'super_admin'));

create policy "read own memberships" on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'));
create policy "super admin manages memberships" on public.organization_members for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- Invitations
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'hotel_admin' check (role in ('hotel_admin','hotel_staff')),
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.organization_invitations(organization_id);
create index on public.organization_invitations(lower(email));
grant select, insert, update, delete on public.organization_invitations to authenticated;
grant all on public.organization_invitations to service_role;
alter table public.organization_invitations enable row level security;
create policy "super admin manages invitations" on public.organization_invitations for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

-- History
create table public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null,
  old_status text,
  new_status text,
  changed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.subscription_history(organization_id, created_at desc);
grant select, insert on public.subscription_history to authenticated;
grant all on public.subscription_history to service_role;
alter table public.subscription_history enable row level security;
create policy "read own history" on public.subscription_history for select to authenticated
  using (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'));
create policy "super admin writes history" on public.subscription_history for insert to authenticated
  with check (public.has_role(auth.uid(),'super_admin'));

-- Re-scope tenant tables
alter table public.hotel_state drop constraint hotel_state_pkey;
alter table public.hotel_state drop column user_id;
alter table public.hotel_state add column organization_id uuid not null references public.organizations(id) on delete cascade;
alter table public.hotel_state add primary key (organization_id);
create policy "members manage hotel state" on public.hotel_state for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'))
  with check (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'));

alter table public.rooms drop column user_id;
alter table public.rooms add column organization_id uuid not null references public.organizations(id) on delete cascade;
create index on public.rooms(organization_id);
create policy "members manage rooms" on public.rooms for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'))
  with check (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'));

alter table public.calendar_sources drop column user_id;
alter table public.calendar_sources add column organization_id uuid not null references public.organizations(id) on delete cascade;
create index on public.calendar_sources(organization_id);
create policy "members manage calendar sources" on public.calendar_sources for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'))
  with check (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'));

alter table public.ical_reservations drop column user_id;
alter table public.ical_reservations add column organization_id uuid not null references public.organizations(id) on delete cascade;
create index on public.ical_reservations(organization_id);
create policy "members manage ical reservations" on public.ical_reservations for all to authenticated
  using (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'))
  with check (public.is_org_member(auth.uid(), organization_id) or public.has_role(auth.uid(),'super_admin'));

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.update_updated_at_column();
create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function public.update_updated_at_column();
