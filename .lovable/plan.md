## Goal

Make the renamed super-admin portal live at `https://hotel-manage.lovable.app/control/login`. The rename is already in the preview build; the published site still serves the old build.

## Steps

1. Run a security scan and review results (publishing is blocked if there are unresolved critical findings).
2. Publish the project so the current build — including the portal move from `/console` → `/control` — is deployed.
3. Confirm the live URLs after deploy:
   - `https://hotel-manage.lovable.app/control/login` — super-admin sign-in
   - `https://hotel-manage.lovable.app/control` — dashboard (after password + authenticator code)
   - Customer app stays at `https://hotel-manage.lovable.app/auth`

## Notes

- The old `/console` and `/admin` paths will return 404 after publish; bookmarks must be updated to `/control/login`.
- No database or auth changes are involved — this is a frontend route rename only, so hotel accounts, invitations, and MFA enrollment are unaffected.
