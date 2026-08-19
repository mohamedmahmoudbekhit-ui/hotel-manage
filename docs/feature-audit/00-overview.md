# 00 — System overview

Audit date: 2026-08-18. Basis: the code currently in the repository. No application code was changed while producing this audit.

## What the product is

A multi-tenant hotel property management system (PMS). Each tenant is an "organization" (one hotel) with rooms, reservation channels, a month-by-month booking calendar, expenses, dashboards, and two-way iCal connections to OTAs. A separate platform console lets the platform owner create and administer hotel accounts and their subscriptions.

## Technical shape

- Framework: TanStack Start v1 (React 19, Vite 7), file-based routing under `src/routes`.
- Backend: Lovable Cloud (Supabase) accessed through `createServerFn` server functions in `*.functions.ts`, server-only helpers in `*.server.ts`, and two public HTTP routes under `src/routes/api/public/`.
- Styling: Tailwind v4 with tokens in `src/styles.css`; shadcn/Radix component library in `src/components/ui`.
- Notable libraries: `jspdf` + `jspdf-autotable` (PDF export), `recharts` (charts), `vaul` (drawers/bottom sheets), `sonner` (toasts), `react-day-picker` (date pickers), `zod` (validation).

## Route map

Public / unauthenticated:

| Route | Purpose |
| --- | --- |
| `/login` | Hotel user sign-in |
| `/auth` | Legacy path, redirects to `/login` |
| `/forgot-password` | Request a password reset (manual queue) |
| `/reset-password`, `/new-password` | Consume a reset token and set a password |
| `/activate` | Consume an activation token |
| `/accept-invite` | Accept a hotel invitation and set a password |
| `/control/login`, `/control/set-password` | Platform console sign-in and first-time password |
| `/api/public/hooks/sync-ical` | Cron endpoint that syncs all active iCal sources |
| `/api/public/ical/$roomId/{$token}.ics` | Tokenised outbound room availability feed |

Authenticated hotel app (`src/routes/_authenticated/`, gated by the managed `route.tsx` layout):

| Route | Purpose |
| --- | --- |
| `/` | Dashboard / KPIs |
| `/bookings` | Monthly and daily calendar, booking CRUD, filters, export |
| `/expenses` | Monthly expenses |
| `/charts` | Charts |
| `/summary` | Monthly summary |
| `/settings` | Hotel name, logo, rooms, currency, channels, iCal in/out |
| `/users` | Hotel team management |
| `/onboarding` | First-run setup |

Platform console (`src/routes/control/`, gated by `route.tsx` + `_shell/route.tsx`):

| Route | Purpose |
| --- | --- |
| `/control` | Console dashboard |
| `/control/hotels` | Hotel accounts and subscriptions |
| `/control/resets` | Password-reset request queue |
| `/control/security` | MFA / recovery codes |

## Data model (public schema)

`organizations`, `organization_members`, `organization_invitations`, `user_roles` (enum `app_role`: `super_admin`, `hotel_admin`, `hotel_staff`), `super_admin_emails`, `admin_recovery_codes`, `password_reset_requests`, `auth_audit_log`, `subscription_plans`, `subscription_history`, `hotel_state` (the whole booking/expense/settings blob as JSONB per organization), `rooms`, `calendar_sources`, `ical_reservations`, `ical_reservation_overrides`, `calendar_sync_logs`.

Security-definer helpers: `has_role`, `is_org_member`, `current_org_id`, `ensure_super_admin_self`, `grant_super_admin_if_seeded`, `update_updated_at_column`.

Important structural note: calendar bookings created inside the PMS are **not** relational rows. They live inside the `hotel_state.data` JSONB document as `months[monthKey].cells[roomName][dayNumber]`. Only iCal-imported reservations are relational (`ical_reservations` + `ical_reservation_overrides`). This single fact explains most of the behaviour and most of the limitations documented in the other sections.

## How to read the rest of this audit

| File | Area |
| --- | --- |
| `01-auth-roles-admin.md` | Authentication, roles, platform console, tenants, subscriptions, team users |
| `02-bookings.md` | Booking creation, editing, deletion, pricing, statuses, refunds, conflicts |
| `03-ical.md` | Inbound and outbound iCal lifecycles, reconciliation, sync failures |
| `04-calendar-ui-mobile.md` | Monthly/daily views, filters, drawers, navigation, mobile behaviour |
| `05-dashboard-finance-settings.md` | KPIs, revenue/occupancy formulas, expenses, settings, exports |
| `07-inventories.md` | Feature, use-case, edge-case, business-rule and integration inventories, gaps, test priorities |

Each feature carries a status label: Fully implemented, Partially implemented, Implemented with known issue, UI only, Backend only, Not implemented.
