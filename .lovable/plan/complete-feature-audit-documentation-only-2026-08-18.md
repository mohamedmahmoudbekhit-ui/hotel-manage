# Complete Feature Audit (documentation only)

Produce one written audit of what the PMS actually does today. No application code is created, changed, or deleted — the only output is a documentation file.

## Deliverable

A single markdown document at `docs/FEATURE_AUDIT.md`, written from a full read of the current code (routes, store, server functions, iCal engine, database migrations and policies), not from past conversation history.

If the document grows past a comfortable single-file size, it is split into `docs/feature-audit/` parts (00-overview, 01-auth-and-roles, 02-bookings, 03-ical, 04-calendar-and-mobile, 05-finance-and-dashboard, 06-admin-console, 07-inventories) with `docs/FEATURE_AUDIT.md` acting as the index.

## What gets audited

Every module in the codebase is read before it is described:

- Auth and access: login, activation, forgot/reset password, invite acceptance, the protected route gate, platform-admin detection, super-admin console login with TOTP MFA and recovery codes.
- Roles and permissions: `super_admin`, `hotel_admin`, `hotel_staff`, what each can reach in the UI and what the database policies actually enforce.
- Super Admin console: hotel list, create/edit hotel, subscription fields and history, invitation link generation and regeneration, password-reset request queue, security screen, audit log.
- Hotel management: hotel name, logo upload, onboarding, settings, rooms, channels (name, colour, currency).
- Team/user management inside a hotel: invite, status, delete rules.
- Bookings: creation from a calendar cell and from the range dialog, single vs multi-night, total-vs-nightly price distribution and rounding, editing as one reservation, date moves, whole-booking deletion, statuses (confirmed, canceled, no-show/early departure, canceled with refund), refund direction and amount, guest name, notes and the note indicator, replacement bookings on an occupied night, conflicts.
- iCal inbound: sources per room, URL validation and SSRF guard, test connection, parsing, reconciliation by UID, new/changed/removed events, date changes, duplicate UIDs, external blocks and unblocks, per-source isolation, failure handling, sync logs, cron cadence, manual sync, overrides on imported reservations.
- iCal outbound: per-room tokenised public feed, what is included and excluded, cache headers, token verification.
- Calendar UI: monthly grid, lanes for overlapping bookings, today indicator, daily view with room statuses, filters, month selector and Add Month, month persistence.
- Finance: expenses (add/edit/delete, monthly filter, totals), dashboard KPIs, revenue, occupancy, ADR, channel breakdown, room performance, currency conversion and dual-currency display, charts, CSV/PDF export.
- UI infrastructure actually in use: drawers, bottom sheets, modals, date pickers, toasts, sidebar, i18n, error boundaries.
- Mobile: every place the mobile path differs from desktop, including the two-level room overview, card-based daily view, drawer navigation, overflow handling.

## Format

Each feature follows the requested structure: Feature, Description, Main user goal, Where it exists (with file paths), Main user flow, Use cases (UC-nn with actor, precondition, steps, expected result), Edge cases (EC-nn with scenario and expected behaviour), States, User actions and their results, Dependencies, Business rules, Mobile behaviour, Automatic/background behaviour, Integrations, Limitations, plus a status label: Fully implemented / Partially implemented / Implemented with known issue / UI only / Backend only / Not implemented.

Bookings and iCal get the extra depth requested, including the two lifecycles: source → iCal → PMS, and PMS → public iCal → external channel.

## Closing sections

- Complete feature inventory (table with status)
- Complete use case inventory
- Complete edge case inventory
- Business rules inventory
- Integration inventory
- Mobile vs desktop differences
- Known issues and gaps
- UI present but not fully functional
- Backend present but not exposed in the UI
- Prioritised test list

## Verification rule

Every claim is tied to code that was read in this pass. Anything ambiguous is marked "needs runtime verification" rather than stated as fact. Nothing outside `docs/` is touched.
