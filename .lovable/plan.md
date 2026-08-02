## Diagnosis (verified)

The super-admin account `mohamedmahmoudbekhit@gmail.com` exists in the auth system but has **no password on record** — it was created through Google sign-in, which was removed when we went invitation-only. So every password attempt at `/console/login` correctly returns "Invalid credentials". A first-time password step is exactly what's missing.

## What to build

### 1. "Set / reset password" entry point on the console sign-in page
Add a small link under the credentials form: **"First time here? Set your password"**.

It asks for the email only and sends a secure one-time link to that mailbox. To avoid revealing which addresses are platform admins, the page always shows the same neutral message ("If this address is authorized, a link is on its way").

Behind it, a server-side check confirms the address is on the platform-admin allowlist before any email is sent; anything else silently does nothing.

### 2. New page: `/console/set-password`
Opened from the emailed link. It:
- Confirms the link is valid and belongs to an allowlisted platform admin (otherwise it signs out and bounces to `/console/login`).
- Shows Password + Confirm password with basic strength rules.
- Saves the password, signs the user out, and returns them to `/console/login` with a success message.

### 3. Flow after that (unchanged)
`/console/login` → email + password → because no authenticator is enrolled yet, the QR setup screen appears → scan with Google/Microsoft Authenticator → enter the 6-digit code → save the 10 backup recovery codes → console.

## Security notes

- The password link is delivered only to the mailbox on the admin allowlist, so possession of the inbox is required — no one can set an admin password from the UI alone.
- The link is single-use and short-lived, and the page rejects any session that isn't an allowlisted platform admin.
- MFA is still mandatory: setting a password alone grants nothing, since the console gate requires a verified second factor.
- The customer login at `/auth` continues to reject super-admin accounts.

## Technical details

- Send the link with `resetPasswordForEmail(email, { redirectTo: origin + '/console/set-password' })`, invoked from a server function that first verifies the address exists in `super_admin_emails` (allowlist lookup runs server-side with privileged access; the client response is always neutral).
- `/console/set-password` is a public route (outside `_shell`, so the AAL2 gate doesn't block it), calls `supabase.auth.updateUser({ password })`, then `signOut()` and navigates to `/console/login`.
- Guard the page by re-checking `ensure_super_admin_self()` after the recovery session hydrates; sign out and redirect if it isn't `true`.
- No database migration needed.
