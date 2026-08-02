import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Super-admin MFA support: backup recovery codes + emergency authenticator
 * reset. TOTP enrollment/verification itself is handled by the auth provider
 * on the client; these functions only manage the recovery-code side, which
 * must never be readable from the browser.
 */

export type MfaStatus = { isSuperAdmin: boolean; remainingCodes: number };

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(raw, (n) => alphabet[n % alphabet.length]);
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

async function assertSuperAdmin(supabase: {
  rpc: (fn: "ensure_super_admin_self") => Promise<{ data: unknown }>;
}) {
  const { data } = await supabase.rpc("ensure_super_admin_self");
  if (data !== true) throw new Error("Forbidden");
}

export const getMfaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MfaStatus> => {
    await assertSuperAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("admin_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("used_at", null);
    return { isSuperAdmin: true, remainingCodes: count ?? 0 };
  });

/** Replaces any existing codes and returns the plaintext set exactly once. */
export const regenerateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ codes: string[] }> => {
    await assertSuperAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codes = Array.from({ length: 10 }, newCode);
    const rows = await Promise.all(
      codes.map(async (code) => ({ user_id: context.userId, code_hash: await sha256(code) })),
    );
    await supabaseAdmin.from("admin_recovery_codes").delete().eq("user_id", context.userId);
    const { error } = await supabaseAdmin.from("admin_recovery_codes").insert(rows);
    if (error) throw new Error(error.message);
    return { codes };
  });

/**
 * Emergency access: burns a valid recovery code and removes the enrolled
 * authenticator so the admin can enroll a new device on their next sign-in.
 */
export const redeemRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => ({ code: String(data.code ?? "").trim().toUpperCase() }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.supabase as never);
    if (data.code.length < 8) throw new Error("Invalid recovery code");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = await sha256(data.code);
    const { data: row } = await supabaseAdmin
      .from("admin_recovery_codes")
      .select("id")
      .eq("user_id", context.userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();
    if (!row) throw new Error("Invalid recovery code");

    await supabaseAdmin
      .from("admin_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: context.userId,
    });
    for (const factor of factors?.factors ?? []) {
      await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: context.userId });
    }
    return { ok: true };
  });
