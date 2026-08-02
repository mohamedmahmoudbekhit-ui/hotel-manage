import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isPasswordValid } from "@/lib/auth/password";

export interface ActivationInfo {
  valid: boolean;
  reason?: "not_found" | "already_used" | "expired" | "error";
  hotelName?: string;
  email?: string;
}

/** Look up an activation (invitation) token. Never reveals unrelated account data. */
export const lookupActivation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(input))
  .handler(async ({ data }): Promise<ActivationInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, organization_id, email, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { valid: false, reason: "not_found" };
    if (inv.accepted_at) return { valid: false, reason: "already_used" };
    if (new Date(inv.expires_at) < new Date()) return { valid: false, reason: "expired" };
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("hotel_name")
      .eq("id", inv.organization_id)
      .maybeSingle();
    return { valid: true, hotelName: org?.hotel_name ?? "", email: inv.email };
  });

/**
 * Complete first-time activation: sets the password on the pending account,
 * activates the membership and burns the single-use token.
 */
export const activateAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (!isPasswordValid(data.password)) throw new Error("Password does not meet the requirements.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, organization_id, email, role, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("This activation link is invalid.");
    if (inv.accepted_at) throw new Error("This activation link has already been used.");
    if (new Date(inv.expires_at) < new Date()) throw new Error("This activation link has expired.");

    // Resolve (or create) the account for this invited email.
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password: data.password,
      email_confirm: true,
    });
    if (created?.user) {
      userId = created.user.id;
    } else if (createErr) {
      const { data: link } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: inv.email,
      });
      userId = link?.user?.id ?? null;
      if (!userId) throw new Error("Unable to activate this account. Contact your administrator.");
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
        email_confirm: true,
      });
      if (updErr) throw new Error(updErr.message);
    }
    if (!userId) throw new Error("Unable to activate this account. Contact your administrator.");

    const { error: memErr } = await supabaseAdmin
      .from("organization_members")
      .upsert(
        {
          organization_id: inv.organization_id,
          user_id: userId,
          role: inv.role,
          status: "active",
        },
        { onConflict: "organization_id,user_id" },
      );
    if (memErr) throw new Error(memErr.message);

    // Remove any other pending placeholder membership rows for this hotel.
    await supabaseAdmin
      .from("organization_members")
      .delete()
      .eq("organization_id", inv.organization_id)
      .eq("status", "pending")
      .neq("user_id", userId);

    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: inv.role }).select();

    await supabaseAdmin
      .from("organization_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "account_activated",
      email: inv.email,
      organization_id: inv.organization_id,
      user_id: userId,
      detail: { role: inv.role },
    });

    return { ok: true };
  });

/**
 * Password reset request. The response never reveals whether the address
 * exists — callers always receive the same generic result.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(200), redirectTo: z.string().url().max(500) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    // Platform administrators reset their password only in the admin portal.
    const { data: seeded } = await supabaseAdmin
      .from("super_admin_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (!seeded) {
      await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo: data.redirectTo });
    }

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "password_reset_requested",
      email,
      detail: { portal: "customer" },
    });

    return { ok: true };
  });

/** Audit hook for completed resets (called after the password is updated). */
export const recordPasswordResetCompleted = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email().max(200) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("auth_audit_log").insert({
      action: "password_reset_completed",
      email: data.email.toLowerCase(),
    });
    return { ok: true };
  });
