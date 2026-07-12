
# Multi-Tenant SaaS Transformation

Scope is large. Shipping in one coordinated change so the app stays runnable throughout.

## 1. Data model (one migration)

Wipe existing tenant data (per your choice), then rebuild scoping around `organization_id`.

New tables:
- `organizations` — hotel_name, logo_url, contact_person, contact_email, contact_mobile, subscription_plan, subscription_status (`trial|active|expired|suspended|cancelled`), start_date, renewal_date, expiry_date, account_status (`active|suspended`), notes, monthly_price_cents, created_at, updated_at
- `organization_members` — (org_id, user_id, role: `hotel_admin|hotel_staff`, status)
- `organization_invitations` — org_id, email, role, token (hashed), expires_at, accepted_at, created_by
- `subscription_history` — org_id, action, old_status, new_status, changed_by, created_at
- `subscription_plans` — code, name, monthly_price_cents, trial_days, features (jsonb) — seeded with **Trial (14 days), Basic ($29/mo), Pro ($79/mo), Enterprise (contact)**. Editable later from super-admin UI.
- `app_role` enum (`super_admin`, `hotel_admin`, `hotel_staff`) + `user_roles` table + `has_role()` security-definer function

Refactored tables (drop existing rows, add `organization_id uuid not null`):
- `hotel_state`, `rooms`, `calendar_sources`, `ical_reservations`

RLS rewritten so every tenant table is gated by `is_member_of(auth.uid(), organization_id)`. Super admin bypasses via `has_role(auth.uid(),'super_admin')`. No hotel can see another hotel's data — enforced in the database, not in code.

Storage: `hotel-logos` bucket policies updated to scope by `organization_id` path prefix.

## 2. Auth & invitation flow

- Email/password stays; Google stays.
- Super admin creates an org + fills contact fields.
- Server function generates an invitation token, sends email via Lovable Emails ("You've been invited to {hotel_name}"). Link → `/accept-invite?token=…` where the user sets a password (or signs in with Google) and is attached to the org as `hotel_admin`.
- Anonymous signup at `/auth` is disabled — only invited users can join. Super admin is bootstrapped separately (see §5).
- Lovable Emails domain setup dialog opens first; invites will start delivering once DNS verifies.

## 3. Super Admin dashboard (`/admin/*`, gated by `super_admin` role)

- **Overview**: KPI cards — Total Hotels, Active, Expired, Trial, MRR (sum of active orgs' plan price).
- **Hotels list**: search + filter by status/plan; columns: hotel, contact, mobile, email, plan, status, renewal date, actions.
- **Actions per hotel**: view, edit, suspend, reactivate, extend subscription (date picker → writes to `subscription_history`), delete, resend invitation, copy invite link.
- **Create hotel** dialog: hotel name, contact email, mobile, plan → creates org + sends invite.
- **Hotel detail page**: full profile, subscription history timeline, members list, notes.
- **Expiry alerts**: banner listing orgs expiring in ≤7 days; nightly cron marks expired orgs and appends to history.

## 4. Hotel Admin experience

- Existing bookings/rooms/expenses/charts/settings routes move to be org-scoped automatically via RLS. Store reads/writes swap `user_id` → `organization_id` (resolved from current membership).
- Header shows hotel name from the org; settings can update hotel name & logo (writes to `organizations`).
- Suspended or expired orgs → blocking screen with "Contact support" message; super admin unaffected.
- Renewal-approaching banner (≤7 days before `renewal_date`).

## 5. Bootstrapping your super-admin account

Migration inserts your email into a `super_admin_emails` seed table. First time you sign in with `mohamedmahmoudbekhit@gmail.com`, a trigger grants the `super_admin` role automatically (verified email required — no privilege escalation from unverified signups). You'll go to `/auth`, sign in (Google or email), and land on `/admin`.

## 6. Notifications

- In-app: expiry banners for super admin and hotel admin.
- Email: 7-day pre-renewal reminder to hotel contact, expiry notice to super admin. Sent by pg_cron → `/api/public/hooks/subscription-notify` (daily). Skipped until email domain is verified.

## 7. Rollout order (single session)

1. Email domain setup dialog.
2. Migration (wipe + new schema + RLS + super_admin bootstrap trigger + seed plans).
3. Server functions: orgs CRUD, invitations, membership resolution, subscription actions, KPIs.
4. Scaffold auth + transactional email templates (invitation, renewal reminder, expired notice).
5. Rewire `HotelProvider` to load state by `organization_id`.
6. New routes: `/admin`, `/admin/hotels`, `/admin/hotels/$id`, `/accept-invite`.
7. Route gates: super_admin layout, suspended/expired blocker for hotel routes.
8. Cron: daily subscription status sweep + reminders.

## Technical notes

- Role checks use security-definer `has_role()` / `is_member_of()` — no recursive RLS.
- All privileged server fns verify caller role, never trust client.
- `hotel_state.data` JSON keeps its current shape; only the row key changes from `user_id` to `organization_id`.
- Existing calendar sync cron keeps working — it iterates all active sources regardless of org.
- Deleting an org cascades to members, invitations, hotel_state, rooms, calendar_sources, ical_reservations, subscription_history.

## What you need to do

- Complete the email domain setup dialog when it appears (one-time DNS records).
- Sign in with `mohamedmahmoudbekhit@gmail.com` after the migration to claim super-admin.

Approve to proceed, or tell me what to change (plans, pricing, notification cadence, etc.).
