import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPasswordValid } from "@/lib/auth/password";

export interface ResetRequestRow {
  id: string;
  email: string;
  organization_id: string | null;
  hotel_name: string | null;
  status: string;
  token: string | null;
  expires_at: string | null;
  used_at: string | null;
  created_at: string;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: super admin only");
}

/**
 * A hotel user asks for a reset. The response is always identical so the
 * endpoint never reveals whether an address exists.
 */
export const submitPasswordResetRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email().max(200) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .ilike("contact_email", email)
      .maybeSingle();

    await supabaseAdmin.from("password_reset_requests").insert({
      email,
      organization_id: org?.id ?? null,
      status: "pending",
    });

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "password_reset_requested",
      email,
      organization_id: org?.id ?? null,
      detail: { channel: "manual_link" },
    });

    return { ok: true };
  });

/** Super admin: every reset request, newest first. */
export const listResetRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResetRequestRow[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, email, organization_id, status, token, expires_at, used_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const orgIds = Array.from(new Set(rows.map((r) => r.organization_id).filter(Boolean))) as string[];
    const names = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await supabaseAdmin.from("organizations").select("id, hotel_name").in("id", orgIds);
      for (const o of orgs ?? []) names.set(o.id, o.hotel_name);
    }
    return rows.map((r) => ({
      ...r,
      hotel_name: r.organization_id ? (names.get(r.organization_id) ?? null) : null,
    })) as ResetRequestRow[];
  });

/** Super admin: mint a single-use, 1-hour reset token for a request. */
export const issueResetLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<{ token: string; email: string }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, email, organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!req) throw new Error("Request not found");

    const token = randomToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);
    const { error } = await supabaseAdmin
      .from("password_reset_requests")
      .update({
        token,
        expires_at: expires.toISOString(),
        used_at: null,
        status: "issued",
        issued_by: context.userId,
      })
      .eq("id", req.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "password_reset_link_issued",
      email: req.email,
      organization_id: req.organization_id,
      user_id: context.userId,
      detail: { expires_at: expires.toISOString() },
    });

    return { token, email: req.email };
  });

/** Super admin: create a reset link for any hotel owner without a request. */
export const createResetLinkForEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email().max(200) }).parse(input))
  .handler(async ({ context, data }): Promise<{ token: string; email: string }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const { data: org } = await supabaseAdmin.from("organizations").select("id").ilike("contact_email", email).maybeSingle();

    const token = randomToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);
    const { error } = await supabaseAdmin.from("password_reset_requests").insert({
      email,
      organization_id: org?.id ?? null,
      token,
      expires_at: expires.toISOString(),
      status: "issued",
      issued_by: context.userId,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "password_reset_link_issued",
      email,
      organization_id: org?.id ?? null,
      user_id: context.userId,
      detail: { expires_at: expires.toISOString(), source: "manual" },
    });

    return { token, email };
  });

export interface ResetTokenInfo {
  valid: boolean;
  reason?: "not_found" | "already_used" | "expired";
  email?: string;
}

/** Public: validate a manually shared reset token. */
export const lookupResetToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(input))
  .handler(async ({ data }): Promise<ResetTokenInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, email, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!req) return { valid: false, reason: "not_found" };
    if (req.used_at) return { valid: false, reason: "already_used" };
    if (!req.expires_at || new Date(req.expires_at) < new Date()) return { valid: false, reason: "expired" };
    return { valid: true, email: req.email };
  });

/** Public: consume the token and set the new password. */
export const completeManualPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (!isPasswordValid(data.password)) throw new Error("Password does not meet the requirements.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabaseAdmin
      .from("password_reset_requests")
      .select("id, email, organization_id, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!req) throw new Error("This reset link is not valid.");
    if (req.used_at) throw new Error("This reset link has already been used.");
    if (!req.expires_at || new Date(req.expires_at) < new Date()) throw new Error("This reset link has expired.");

    // Resolve the account for this address.
    const { data: link } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email: req.email });
    const userId = link?.user?.id ?? null;
    if (!userId) throw new Error("No account found for this address. Contact your administrator.");

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: data.password,
      email_confirm: true,
    });
    if (updErr) throw new Error(updErr.message);

    // Revoke every existing session for this account.
    try {
      await (supabaseAdmin.auth.admin as unknown as { signOut: (id: string, scope: string) => Promise<unknown> }).signOut(
        userId,
        "global",
      );
    } catch {
      /* best effort — the password change already rotates refresh tokens */
    }

    await supabaseAdmin
      .from("password_reset_requests")
      .update({ used_at: new Date().toISOString(), status: "used", token: null })
      .eq("id", req.id);

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "password_reset_completed",
      email: req.email,
      organization_id: req.organization_id,
      user_id: userId,
    });

    return { ok: true };
  });
