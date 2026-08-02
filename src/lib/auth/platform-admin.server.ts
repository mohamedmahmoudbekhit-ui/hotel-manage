import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const PLATFORM_ADMIN_EMAIL_MESSAGE =
  "This email belongs to a platform administrator account and cannot be used for a hotel or team account. Please use a different email address.";

/**
 * Platform administrators sign in only through the separate admin portal, so the
 * customer login rejects their sessions. Creating a hotel/team account for such an
 * email produces an account that can never sign in — block it at the source.
 */
export async function isPlatformAdminEmail(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();

  const { data: seeded } = await supabaseAdmin
    .from("super_admin_emails")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();
  if (seeded) return true;

  // Also catch accounts that already hold the super_admin role.
  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = users?.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
  if (!match) return false;

  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", match.id)
    .eq("role", "super_admin")
    .maybeSingle();
  return Boolean(role);
}

export async function assertNotPlatformAdminEmail(email: string): Promise<void> {
  if (await isPlatformAdminEmail(email)) throw new Error(PLATFORM_ADMIN_EMAIL_MESSAGE);
}
