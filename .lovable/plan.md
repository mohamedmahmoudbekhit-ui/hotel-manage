# Plan

## 1. RTL sidebar position (Arabic)
- In `src/routes/__root.tsx` (or wherever `SidebarProvider`/`AppSidebar` is rendered), read `dir` from `useI18n()` and pass `side="right"` to `<Sidebar>` when `dir === "rtl"`.
- Verify header trigger stays visible on both sides.

## 2. Expenses as its own sidebar tab (below Bookings)
- Create `src/routes/expenses.tsx` that renders the existing expense breakdown UI currently embedded in Settings (extract into a shared `<ExpenseBreakdown/>` component in `src/components/expense-breakdown.tsx` to reuse). Include the month selector at top.
- Remove the expense section from `src/routes/settings.tsx` (keep general/rooms/month params/danger zone).
- Add nav item in `src/components/app-sidebar.tsx` between Bookings and Charts: `{ title: t("nav.expenses"), url: "/expenses", icon: Receipt }`.
- Add `nav.expenses` translations (EN: "Expenses", AR: "المصروفات").

## 3. Auth (email + Google) with per-account private data
- Enable Lovable Cloud.
- Configure Google social auth via `supabase--configure_social_auth`.
- Create `/auth` public route with email/password sign up + sign in and a "Continue with Google" button (uses `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`).
- Move all app routes under `src/routes/_authenticated/` (index, bookings, expenses, charts, summary, settings). The integration-managed `_authenticated/route.tsx` gate redirects unauthenticated users to `/auth`.
- Root `onAuthStateChange` listener invalidates router/query cache on sign in/out.
- Add sign-out button + user email in the header.

### Data model (Supabase)
Single JSON blob per user keeps scope small and preserves the current in-memory shape:

```sql
create table public.hotel_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hotel_name text not null,
  onboarded boolean not null default false,
  data jsonb not null,           -- { settings, months, currentMonthKey }
  updated_at timestamptz not null default now()
);
```
+ GRANTs, RLS: user can select/insert/update/delete only rows where `user_id = auth.uid()`.

- Replace `localStorage` persistence in `src/lib/hotel/store.tsx` with server-fn calls:
  - `loadHotelState` (auth-required) → returns row or null.
  - `saveHotelState` (auth-required) → upserts full blob (debounced from client, ~500ms).
- Store hydrates from server on mount; shows loading state until fetched.

## 4. Hotel onboarding flow
- After sign-in, if `hotel_state` row is missing or `onboarded=false`, redirect to `/onboarding` (under `_authenticated/`).
- Onboarding form (single page, i18n):
  - Hotel name (required)
  - Rooms list (add/remove, at least 1 required, prefilled with sensible defaults user can edit)
  - USD → EGP rate (required, number)
  - Management share % (required, number, default 20)
- Submit creates the `hotel_state` row with initial `settings` (rooms, defaultUsdRate, defaultManagementPct, currency=EGP) and one empty current-month seeded via existing `emptyMonth` helper, sets `onboarded=true`, then navigates to `/`.
- All other existing data (seed months) is NOT auto-added; new accounts start clean with the current month only, as requested ("the rest data you already added will keep it as is" = feature set/logic, not the June 2026 sample rows).

## Technical notes
- Client bearer middleware: append generated `attachSupabaseAuth` in `src/start.ts` if not already registered.
- Server fns live in `src/lib/hotel/state.functions.ts` using `requireSupabaseAuth`.
- `HotelProvider` becomes async: renders children only after initial load; onboarding gate handled by a small wrapper that checks `hotelName`/`onboarded`.
- No breaking changes to existing UI components — they still read from `useHotel()`.

## Deliverables
- Cloud enabled, Google provider configured, migration applied.
- New routes: `/auth`, `/_authenticated/onboarding`, `/_authenticated/expenses`, plus moved existing routes.
- New components: `ExpenseBreakdown`, `OnboardingForm`, `AuthPage`, header user menu.
- Store rewired to Supabase; RTL sidebar; i18n additions.
