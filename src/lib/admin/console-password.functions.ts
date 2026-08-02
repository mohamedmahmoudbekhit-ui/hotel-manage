import { createServerFn } from "@tanstack/react-start";

/**
 * First-time password setup / reset for platform console accounts.
 *
 * The response is deliberately always identical so the endpoint cannot be used
 * to discover which addresses are platform administrators.
 */
export const sendConsolePasswordLink = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; redirectTo: string }) => ({
    email: String(data.email ?? "").trim().toLowerCase(),
    redirectTo: String(data.redirectTo ?? ""),
  }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    if (!data.email || !/^https?:\/\//.test(data.redirectTo)) return { ok: true };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: seeded } = await supabaseAdmin
      .from("super_admin_emails")
      .select("email")
      .eq("email", data.email)
      .maybeSingle();

    if (!seeded) return { ok: true };

    await supabaseAdmin.auth.resetPasswordForEmail(data.email, {
      redirectTo: data.redirectTo,
    });

    return { ok: true };
  });
