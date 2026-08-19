# iCal Integration Lifecycle Audit

Scope: two-directional iCal sync between external OTAs (Airbnb, Booking.com, Vrbo, etc.) and the PMS.
- Lifecycle A (inbound): external calendar -> `calendar_sources` -> `ical_reservations` (+ `ical_reservation_overrides`).
- Lifecycle B (outbound): PMS manual bookings -> generated `.ics` feed served to OTAs.

Files read: `src/lib/hotel/calendar-sync.server.ts`, `src/lib/ical/parse.ts`, `src/lib/ical/fetch.server.ts`, `src/lib/ical/export.server.ts`, `src/lib/hotel/calendar.functions.ts`, `src/components/calendar-integrations.tsx`, `src/components/ical-export.tsx`, `src/routes/api/public/hooks/sync-ical.ts`, `src/routes/api/public/ical/$roomId/{$token}[.]ics.ts`, and SQL migrations under `supabase/migrations/` (see file list at end).

---

### Feature: Inbound iCal sync (source -> PMS)
Status: Fully implemented

Description: Pulls a remote `.ics` URL for a `calendar_sources` row, parses VEVENTs, and reconciles them against the `ical_reservations` table scoped to that single source, inserting new bookings, updating changed ones, and deleting ones no longer present in the feed.

Main user goal: Automatically block PMS room availability for reservations made on external channels (Airbnb/Booking.com/Vrbo/etc.) without manual re-entry.

Where it exists:
- `src/lib/hotel/calendar-sync.server.ts` (`syncCalendarSource`, `syncAllActiveSources`)
- `src/lib/ical/fetch.server.ts` (`fetchIcal`, SSRF hardening)
- `src/lib/ical/parse.ts` (`parseIcal`, `isLikelyIcalUrl`)
- `src/lib/hotel/calendar.functions.ts` (`saveCalendarSource`, `syncOneSource`, `syncAllForUser`, `testIcalConnection`, `listSyncLogs`, `listImportedForMonth`, `saveImportedOverride`, `removeImportedReservation`)
- `src/components/calendar-integrations.tsx` (admin UI)
- `src/routes/api/public/hooks/sync-ical.ts` (cron-triggered mass sync endpoint)
- SQL: `calendar_sources`, `ical_reservations`, `ical_reservation_overrides`, `calendar_sync_logs` (see migrations list)

Main user flow:
1. Admin adds a room (via `ensureAndListRooms`, sourced from `settings.rooms` in hotel state) and a calendar source (`SourceEditor` in `calendar-integrations.tsx`), providing name, platform, iCal URL, channel mapping, and color.
2. On save, `saveCalendarSource` validates the URL shape (`isLikelyIcalUrl`) and upserts into `calendar_sources`; the UI immediately triggers an initial `syncOneSource` call (`calendar-integrations.tsx` line ~103).
3. `syncCalendarSource` fetches the URL (`fetchIcal`), parses events (`parseIcal`), and reconciles against `ical_reservations` for that `source_id` only.
4. New UIDs are inserted, changed UIDs (dates/summary/room/platform) are updated, UIDs no longer in the feed are deleted (their overrides cascade-delete via FK `ON DELETE CASCADE`).
5. `calendar_sources.last_sync_at`, `last_success_at` / `last_sync_error` are updated, and a `calendar_sync_logs` row is inserted with counts and duration.
6. Cron (`/api/public/hooks/sync-ical`) periodically calls `syncAllActiveSources`, which repeats step 3-5 for every `is_active = true` source in parallel (`Promise.all`).
7. Admin can view imported reservations per month (`listImportedForMonth`) and apply per-reservation overrides (price, notes, channel, status, hide, refund).

Use Cases:
- UC-01: Actor: Hotel admin. Precondition: room and channel exist. Steps: add calendar source with valid `.ics` URL, save. Expected result: source created, initial sync runs, imported reservations become visible and block the room's calendar.
- UC-02: Actor: Hotel admin. Precondition: source exists. Steps: click "Sync now" (`doSyncOne`). Expected result: `syncCalendarSource` runs immediately; toast shows imported count or error; `last_sync_at`/`last_sync_error` and a new `calendar_sync_logs` row update.
- UC-03: Actor: Hotel admin. Precondition: multiple sources exist. Steps: click "Sync all" (`doSyncAll` -> `syncAllForUser`). Expected result: all of the org's active sources are re-synced in parallel; a summary toast reports total/failed counts.
- UC-04: Actor: Hotel admin. Precondition: adding/editing a source. Steps: paste URL, click "Test connection" (`testIcalConnection`). Expected result: fetch+parse run without persisting anything; preview of up to 8 upcoming events, byte size, content-type, and final URL (post-redirect) is shown, or an error message if it fails.
- UC-05: Actor: Hotel admin. Precondition: imported reservation exists. Steps: open reservation, set price/notes/channel/status via `saveImportedOverride`. Expected result: `ical_reservation_overrides` row upserted (`onConflict: reservation_id`); original `ical_reservations` row is never modified.
- UC-06: Actor: Hotel admin. Precondition: imported reservation exists. Steps: call `removeImportedReservation`. Expected result: an override with `hidden: true` is upserted; the reservation is filtered out of `listImportedForMonth` results but the underlying `ical_reservations` row and the source's next sync are unaffected (it will reappear if `hidden` isn't matched against feed presence — hiding is a display-only override, not a delete).
- UC-07 (cron): Actor: Supabase Cron/pg_cron job. Precondition: presents the project `apikey` header. Steps: POST to `/api/public/hooks/sync-ical`. Expected result: `timingSafeEqual` compares against `SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEY`; on match, all active sources across all organizations are synced; a JSON summary `{ ok, total, failed, at }` is returned.

Edge Cases:
- EC-01 New event: UID not present in `existingByUid` -> inserted as a new `ical_reservations` row (`calendar-sync.server.ts` lines 105-119).
- EC-02 Unchanged event: UID present, all compared fields identical -> no DB write for that row (not counted in `imported`).
- EC-03 Changed event (dates or summary or room/platform metadata changed): row is updated in place, `updated_at` refreshed; existing overrides remain attached (`ical_reservation_overrides.reservation_id` FK unaffected by an UPDATE, only by DELETE).
- EC-04 Changed dates specifically: covered by the same "changed" branch — `start_date`/`end_date` diff triggers update; no special handling to detect "moved" vs "resized" bookings.
- EC-05 Cancelled/removed event: UID disappears from the current feed -> row is in `staleIds` and is hard-deleted; because of `ON DELETE CASCADE` on `ical_reservation_overrides.reservation_id`, any manual overrides (price/notes/refund) for that reservation are also permanently deleted with no archival.
- EC-06 Duplicate UID within one feed: `byUid` Map dedupes by UID, "last one wins" per code comment (line 77-78) — earlier VEVENTs with the same UID are silently discarded before reconciliation.
- EC-07 Parse failure (malformed ics, no BEGIN:VEVENT matches, etc.): `parseIcal` throwing is caught in `syncCalendarSource`, source's `last_sync_error` set to "Could not parse the calendar file: ...", logged with `status: "error"`; existing `ical_reservations` rows are left untouched (no partial reconciliation happens since it fails before reconciliation).
- EC-08 Network failure / timeout: `fetchIcal` aborts after 20s (`FETCH_TIMEOUT_MS`) or on fetch throw; error surfaces as "The calendar server did not respond in time" or "Could not reach the calendar server: ..."; sync fails cleanly, existing data untouched.
- EC-09 HTTP 401/403: explicit message "Access denied by the calendar provider ... link may have been revoked".
- EC-10 HTTP 404: explicit message "Calendar not found (HTTP 404)".
- EC-11 HTTP 429: explicit message about rate limiting, suggesting retry later.
- EC-12 Other non-2xx status: generic `The calendar server returned HTTP {status}`.
- EC-13 Oversize file (> 5MB `MAX_BYTES`): rejected after full buffer download with "The calendar file is too large (over 5 MB)" — the whole body is downloaded into memory before the size check, so the check is not a streaming/early-abort guard (`fetch.server.ts` line 132-133).
- EC-14 Redirects: manual redirect handling (`redirect: "manual"`), followed up to `MAX_REDIRECTS = 5` hops, each hop re-validated with `assertPublicHost`; missing `Location` header on a 3xx throws; exceeding 5 hops throws "Too many redirects".
- EC-15 SSRF / private-host rejection: `assertPublicHost` blocks IPv4 private/loopback/link-local/CGNAT/multicast ranges, IPv6 loopback/ULA/link-local, `.localhost`/`.local`/`.internal`/`.home.arpa` suffixes, bare hostnames without a dot, and IPv4-mapped IPv6; re-checked on every redirect hop so a redirect cannot bypass it. Only `http:`/`https:` protocols allowed post-normalization (`webcal:` is rewritten to `https:` in `normalizeIcalUrl`).
- EC-16 Non-calendar response (e.g., HTML login page): rejected with a specific "That link returned a web page, not a calendar file" message when `BEGIN:VCALENDAR` is absent and content looks like HTML, else a generic "not a valid iCalendar file" message.
- EC-17 Source isolation: reconciliation only ever reads/writes `ical_reservations` filtered by `source_id = source.id` (`calendar-sync.server.ts` lines 86-89, 152-171); it never touches manual/offline bookings (which live in the separate `hotel_state` JSON blob) nor other sources' rows, even for the same room.
- EC-18 Stale record deletion for external room blocks: an "external room block" from an OTA (e.g., an owner block or maintenance hold pushed via iCal) is represented the same as any VEVENT — imported as an `ical_reservations` row; when the OTA removes the block, the UID vanishes from the feed and the row is deleted on next sync ("unblock").
- EC-19 Inactive source: `syncCalendarSource` returns `{ ok: true, imported: 0, removed: 0, found: 0 }` immediately without fetching, logging, or updating `last_sync_at` when `is_active` is false (line 32-34) — an inactive source is fully skipped, including by `syncAllActiveSources`'s query filter (`eq("is_active", true)`).
- EC-20 Source not found (deleted mid-flight, or bad id from `syncOneSource`): returns `ok: false` with "Source not found" and does not write a log row (fails before `source` is resolved).
- EC-21 DB error at any step (existing-fetch, insert, update, delete): `fail()` helper persists `last_sync_error`, logs a `status: "error"` row, and returns `ok:false`; partial writes already committed before the failing step are not rolled back (no transaction wraps insert/update/delete).

States: Source `is_active` (true/false), `last_sync_at`/`last_success_at`/`last_sync_error` (null until first sync), sync log `status` in `{"success","error"}`, override `status` in `{"active"(=confirmed),"noshow","canceled","refunded"}` plus `hidden` boolean.

User actions and what happens after each:
- Add source -> row inserted, immediate sync fires (`calendar-integrations.tsx` `doSave`).
- Edit source (URL/room/channel/active) -> row updated; sync not automatically re-triggered by edit alone (only add-flow chains a sync).
- Toggle inactive -> source skipped by both manual "sync all" query and cron's `syncAllActiveSources` (filtered `is_active=true`); its previously imported reservations are NOT deleted (they remain until a future active sync marks their UIDs stale, since inactive sources never run reconciliation to detect removal).
- Delete source -> `calendar_sources` row deleted; FK `ical_reservations.source_id REFERENCES calendar_sources(id) ON DELETE CASCADE` removes all its imported reservations (and their overrides cascade further).
- Sync now / Sync all -> as above (UC-02/UC-03).
- Test connection -> read-only preview, no persistence.
- Apply override (price/notes/channel/status/refund) -> upserts `ical_reservation_overrides`; original `ical_reservations` row (dates, summary, external_uid) is never modified by this action.
- Hide reservation ("remove") -> sets `hidden:true` override; row remains in DB and will still count in future sync stats since the sync logic never reads/writes `hidden`.
- View sync logs -> read-only `listSyncLogs` query, most recent 10 by default, max 50.

Dependencies: `pg_cron` and `pg_net` Postgres extensions enabled (`supabase/migrations/20260710094741_...sql`), external HTTP call to OTA's calendar server, `SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEY` env var for cron auth, `supabaseAdmin` (service-role) client bypassing RLS for both auth'd server-fn calls and the public cron route.

Business rules:
- The current feed is treated as the full source of truth for that one source; anything not currently present is considered gone and deleted (hard delete, no soft-delete/tombstone).
- Reconciliation is scoped strictly per `source_id`; a UID collision across two different sources does not interact (uniqueness constraint is `(source_id, external_uid)` per SQL).
- `platform_type`, `room_id`, and `color`/`channel_id` on the source drive labeling of every one of its imported reservations; changing a source's room/platform retroactively updates existing imported rows on next sync (via the "changed" comparison, since `local.room_id !== source.room_id` is treated as a change).
- A reservation's channel mapping (`channel_id`) supplies color/currency/reporting category in the UI (`calendar-integrations.tsx` lines 206-218, comment in `calendar.functions.ts` line 46); a source without a mapped channel shows "No channel mapped" badge.
- Refund status requires both `refund_direction` and a positive `refund_amount` (zod `.refine` in `overrideSchema`, `calendar.functions.ts` lines 278-280).
- `status: "confirmed"` from the UI is stored as legacy value `"active"` in the DB (comment line 305-306), single source of truth is the incoming `status` field.

Mobile behaviour: Not explicitly differentiated in code; `calendar-integrations.tsx` uses responsive Tailwind classes (`flex-wrap`, popover width `min(20rem, calc(100vw-2rem))`) implying the same feature works in a scaled-down layout, but no distinct mobile logic path exists. Needs runtime verification for actual mobile UX.

Automatic/background behaviour:
- Public cron endpoint `/api/public/hooks/sync-ical` (POST) is designed to be called by pg_cron; the route comment states "every 5 minutes" but no `cron.schedule(...)` call exists anywhere under `supabase/migrations/` — only `CREATE EXTENSION IF NOT EXISTS pg_cron;` is present. The actual cadence is therefore configured outside of migrations (e.g., directly in the hosted Supabase project) and cannot be verified from code; needs runtime verification.
- UI does not appear to poll for sync status changes on its own; `calendar-integrations.tsx` only refreshes on mount and after explicit user actions (no `setInterval`/polling loop found in the reviewed file).

Integrations: Any `.ics`-exposing platform (Airbnb, Booking.com, Vrbo, "direct", "other" per `platforms` enum in `calendar.functions.ts`).

Limitations / known issues:
- Deleting a stale reservation on sync permanently cascades-deletes its override (price/refund/notes history is lost, not archived).
- Oversize check happens after the entire response body is buffered in memory, not as a streaming cutoff — a malicious/huge feed still consumes full download bandwidth/memory up to time-out before rejection.
- Inactive sources are not reconciled, so their previously imported bookings can go stale (remain blocking a room) indefinitely until reactivated and re-synced.
- No transactional wrapping around insert/update/delete in `syncCalendarSource`; a mid-loop DB failure can leave a source partially synced (e.g., some rows updated, some stale rows not yet deleted).
- Duplicate UID handling silently keeps only the last occurrence in file order, which may not match provider intent for recurring/split events.
- Cron schedule/cadence is not present in the SQL migrations reviewed; needs runtime verification against the live Supabase project configuration.

---

### Feature: Outbound iCal export (PMS -> public iCal -> OTA)
Status: Fully implemented, with a documented one-way isolation limitation

Description: Publishes a public, token-secured, read-only `.ics` feed per room containing only confirmed manual/offline PMS bookings, for OTAs to subscribe to and block their own calendars.

Main user goal: Prevent double-bookings by letting external channels see (and block against) reservations made directly in the PMS.

Where it exists:
- `src/lib/ical/export.server.ts` (`collectRoomBookings`, `buildIcs`)
- `src/routes/api/public/ical/$roomId/{$token}[.]ics.ts` (public GET route)
- `src/lib/hotel/calendar.functions.ts` (`listRoomFeeds`, `regenerateRoomFeedToken`)
- `src/components/ical-export.tsx` (admin UI)
- SQL: `rooms.ical_export_token` (added `supabase/migrations/20260802152318_...sql`)

Main user flow:
1. Admin opens the "Export calendar (iCal)" panel; `ensureAndListRooms` ensures rooms exist for names in `settings.rooms`, then `listRoomFeeds` returns each room's `id` and `ical_export_token`.
2. UI builds a feed URL `${origin}/api/public/ical/${room.id}/${room.token}.ics` per room (`ical-export.tsx` `feedUrl`).
3. Admin copies the link into the OTA's "import calendar" field, or previews it in a new tab.
4. OTA (or browser) issues GET requests against that URL on its own polling schedule.
5. Route validates `roomId` (UUID regex) and `token` (hex, 32-128 chars) shape, loads the room row, and does a constant-time comparison of the provided token against `rooms.ical_export_token`.
6. On match, it loads the org's `hotel_state.data` JSON blob, extracts blocking bookings for that room name via `collectRoomBookings`, and serializes them to `.ics` via `buildIcs`.
7. Admin can regenerate a room's token (`regenerateRoomFeedToken`), immediately invalidating the previous link.

Use Cases:
- UC-01: Actor: OTA calendar-import service. Precondition: valid room id + token. Steps: GET the `.ics` URL. Expected result: 200 response with `text/calendar` body listing current confirmed bookings for that room, computed fresh from the live DB each request.
- UC-02: Actor: Hotel admin. Precondition: on export settings page. Steps: click "Copy" for a room's link. Expected result: link copied to clipboard via `navigator.clipboard`, toast confirmation; on failure, error toast.
- UC-03: Actor: Hotel admin. Precondition: link previously shared. Steps: click "Regenerate". Expected result: after a confirm dialog, a new random 24-byte hex token replaces `ical_export_token`; the old link's token no longer matches and returns 404 immediately.
- UC-04: Actor: Anyone with an old/guessed link. Precondition: token doesn't match or room doesn't exist/lacks a token. Steps: GET the URL. Expected result: `404 Not found` (generic, no information disclosure about reason).

Edge Cases:
- EC-01: Booking cancelled with refund or plain "canceled"/"refunded" status (`blocksRoom` in `export.server.ts`): excluded from the export — the room is shown as free for that period, matching PMS reality.
- EC-02: Booking with legacy `canceledWithRefund` flag but no explicit `status`: also excluded (line 18) for backward compatibility with older cell data shape.
- EC-03: No-show status (`noshow`): NOT excluded by `blocksRoom` (only `canceled`/`refunded` are excluded) — a no-show still blocks the room in the export, i.e. it is treated as an active/confirmed reservation for calendar purposes.
- EC-04: A single booking's nights are non-contiguous in the stored cell data (defensive case — e.g. gap from a partially released middle night): `collectRoomBookings` sorts nights and flushes a new VEVENT ("run") whenever there's a gap, producing multiple VEVENTs sharing the base UID suffixed `-2`, `-3`, etc. (lines 79-99), ensuring UID stability while still reflecting real availability.
- EC-05: Imported iCal reservations from other calendar sources: intentionally excluded from the export entirely (`export.server.ts` header comment, line 1-3) — `collectRoomBookings` only reads from the `hotel_state` months/cells blob (manual/offline bookings), not from `ical_reservations`, specifically to avoid feedback loops (re-exporting a channel's own booking back to it).
- EC-06: Missing/invalid room id or token format: rejected before any DB query with a 404 via regex pre-check (`roomId` must match `^[0-9a-f-]{36}$`, token `^[0-9a-f]{32,128}$`).
- EC-07: Room exists but has no `ical_export_token` (shouldn't normally happen since the column has a NOT NULL default, but defensively checked): 404.
- EC-08: Token length mismatch or content mismatch: `timingSafeEqual` requires equal-length buffers first, else immediate 404 without invoking the constant-time compare (still safe against timing attacks since the length check is on a hex-token — length differences aren't typically exploitable for guessing, but note this is a non-constant-time early return).
- EC-09: No `hotel_state` row for the org: `state?.data ?? null` passed through — `collectRoomBookings` treats absent data as zero bookings, producing an otherwise valid but empty calendar rather than an error.
- EC-10: Very long summary/notes text: `escapeText` escapes backslashes, semicolons, commas and newlines per iCal spec; `fold()` wraps lines over 73/72 chars per RFC 5545 folding rules.

States: Feed is stateless/derived — there is no "sync status" for the outbound direction; each GET recomputes from current `hotel_state`.

User actions and what happens after each:
- Copy link -> clipboard write, no server call.
- Preview (opens link in new tab) -> triggers the same GET as an OTA would; downloads/displays the `.ics`.
- Regenerate -> new token persisted immediately; old link starts 404ing on the very next request (no grace period).

Dependencies: `rooms.ical_export_token` column (hex, default `encode(gen_random_bytes(24),'hex')`), `hotel_state.data` JSON blob (shared with the rest of the app's booking grid), `crypto.getRandomValues` (client-generated) is NOT used for regeneration — token bytes are generated server-side in `regenerateRoomFeedToken` (`calendar.functions.ts` lines 443-445) using `crypto.getRandomValues` in the server function's Node/edge runtime context.

Business rules:
- Only confirmed (non-canceled/non-refunded) manual bookings are exported; imported (iCal-sourced) reservations are never re-exported, preventing OTA-to-OTA sync loops and preventing a hotel's own re-export of a channel's booking back to that same channel.
- UID format for exported bookings is `${bookingId ?? "{roomName}-{date}"}${part>1 ? "-{part}" : ""}@hotel-management`, kept stable across requests as long as the underlying `bookingId`/date and contiguous run structure don't change, which matters for OTAs that dedupe by UID across polls.
- Cache-Control is explicitly `no-store, no-cache, must-revalidate, max-age=0` plus `CDN-Cache-Control: no-store`, `Pragma: no-cache`, `Expires: 0` — the route comment states availability must never be served stale since OTAs poll on their own schedule (route file lines 38-39).

Mobile behaviour: Not applicable / no distinct mobile logic; the export panel UI (`ical-export.tsx`) uses the same responsive Tailwind wrapping as other admin panels. Needs runtime verification for mobile layout specifics.

Automatic/background behaviour: None — the outbound feed is purely pull-based; the PMS does not push updates, it just always serves live data on each OTA-initiated GET.

Integrations: Any OTA/platform capable of importing an `.ics` URL (Airbnb, Booking.com, Vrbo, Google Calendar, etc.).

Limitations / known issues:
- No versioned/soft revocation of tokens: regeneration is immediate and total, no overlap window for OTAs that cache the old link.
- No rate limiting or abuse protection visible on the public export route beyond the token itself; needs runtime verification (e.g., whether the platform's edge/CDN layer applies rate limiting).
- `blocksRoom` treats no-shows as blocking, which is a deliberate but implicit business rule that could surprise if a no-show should ideally free the room for other channels.

---

### Feature: Room management as it relates to calendar sources
Status: Partially implemented (works, but with a naming/identity duplication caveat)

Description: Rooms used for calendar sync are DB rows in `public.rooms` (with `id`, `room_name`, `ical_export_token`), while the rest of the app's booking grid identifies rooms by the *name string* stored in `settings.rooms` (part of the `hotel_state` JSON blob), not by `rooms.id`.

Main user goal: Ensure calendar sources/imports and exports are attached to the correct physical room, consistently with how the booking grid displays it.

Where it exists:
- `src/lib/hotel/calendar.functions.ts` (`ensureAndListRooms`, `RoomRow`)
- `supabase/migrations/20260710094741_...sql` (rooms table definition, originally `user_id`-scoped)
- `supabase/migrations/20260712203555_...sql` (org-based rewrite, wipes and re-keys tenant data to organizations)
- `src/components/calendar-integrations.tsx`, `src/components/ical-export.tsx` (both call `ensureAndListRooms({ names: settings.rooms })` on mount)

Main user flow:
1. `settings.rooms` (an array of room-name strings) lives in the hotel's `hotel_state` and is the canonical room list for the booking grid UI.
2. Both the calendar-integrations panel and the iCal-export panel call `ensureAndListRooms` with those names on load.
3. `ensureAndListRooms` diffs the incoming names against existing `rooms.room_name` values for the org, inserts any missing ones, and returns the full `{id, room_name}` list ordered alphabetically.
4. Calendar sources (`calendar_sources.room_id`) and export tokens (`rooms.ical_export_token`) reference this `rooms.id`, not the name string directly.
5. `collectRoomBookings` (export path) looks up bookings in `hotel_state.data.months[...].cells[roomName]` by `room_name` string, bridging the two identity systems.

Use Cases:
- UC-01: Actor: Hotel admin renames a room in the booking-grid settings (`settings.rooms`). Precondition: a `calendar_sources`/`rooms` row already exists under the old name. Steps: rename in settings, open calendar integrations page. Expected result: `ensureAndListRooms` treats the new name as a brand-new room (inserts a new `rooms` row) since matching is by exact string; the old `rooms` row (and any calendar sources/export token attached to it) is orphaned under the stale name, not renamed or merged. This needs runtime verification since it could not be tested live, but is evident from the "insert missing names" logic (`calendar.functions.ts` lines 83-94) having no update/rename path.

Edge Cases:
- EC-01: Two rooms with identical names in `settings.rooms` after dedup (`Array.from(new Set(...))`) collapse to a single DB row — calendar sources cannot be split across visually "duplicate" room names.
- EC-02: A room deleted from `settings.rooms` (removed from the booking grid) but still present in `public.rooms`: its `rooms` row, any `calendar_sources`, `ical_reservations`, and export token are NOT automatically cleaned up — `ensureAndListRooms` only ever inserts missing names, never deletes rows for names no longer in `settings.rooms`. The row simply stops appearing in the "add source" room list next time `ensureAndListRooms` is called (since the returned list is still all DB rows for the org, ordered by name — actually it returns ALL org rooms regardless of whether currently in `settings.rooms`, so a removed-from-settings room would still show up in the calendar UI's room grouping until manually deleted). Needs runtime verification of exact UI behavior in this scenario.

States: N/A (structural/identity concern, not a stateful feature).

Dependencies: `settings.rooms` (client-side hotel settings state, outside the files audited here — needs runtime verification of its own storage/CRUD), `public.rooms` table.

Business rules: Room matching between the booking-grid's `settings.rooms` string array and the relational `rooms` table is purely by exact `room_name` string equality within an org; there is no foreign key or two-way sync/rename propagation implemented in the audited files.

Limitations / known issues:
- Renaming a room in the booking-grid settings does not rename/merge the corresponding `rooms` row used by calendar sync/export, effectively silently detaching existing calendar sources and export links from the renamed room. This is the most significant structural risk found in this area and needs runtime verification to confirm actual observed behavior (e.g., whether some other code path not reviewed here reconciles renames).
- No deletion path for `rooms` rows was found in the audited files (no `deleteRoom` server function), so stale rooms can accumulate.

---

## Section inventory

- Inbound iCal sync (source -> PMS): Fully implemented
- Outbound iCal export (PMS -> public iCal -> OTA): Fully implemented
- Room management as it relates to calendar sources: Partially implemented (naming/identity duplication risk)

## Known gaps

- No `cron.schedule(...)` job found in SQL migrations despite `pg_cron`/`pg_net` extensions being enabled; the "every 5 minutes" cadence is only asserted in a code comment on `src/routes/api/public/hooks/sync-ical.ts` and needs runtime verification against the live project's scheduled jobs configuration.
- Deleting stale inbound reservations cascade-deletes their price/refund/note overrides permanently, with no audit trail or soft-delete.
- Inactive calendar sources are fully skipped by both manual and cron sync paths, so their previously imported reservations can become stale indefinitely.
- No transactional guarantee around the insert/update/delete sequence in `syncCalendarSource`; a failure mid-sequence can leave partial writes.
- Renaming a room in the booking-grid `settings.rooms` list does not propagate to the relational `rooms` table used by calendar sources/export tokens, risking silently orphaned integrations.
- No `rooms` deletion path found in the audited files.
- Outbound export excludes no-show-flagged bookings from being freed (they still block), which is an implicit rather than explicitly documented business rule.
- No explicit rate-limiting observed on the public export or sync-webhook routes beyond token/apikey checks; needs runtime verification.
