import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface InvitationInfo {
  valid: boolean;
  reason?: string;
  organizationId?: string;
  hotelName?: string;
  email?: string;
  role?: string;
}

/** Publicly readable invitation lookup by token (via service role). */
export const lookupInvitation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(input))
  .handler(async ({ data }): Promise<InvitationInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, organization_id, email, role, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) return { valid: false, reason: "not_found" };
    if (inv.accepted_at) return { valid: false, reason: "already_accepted" };
    if (new Date(inv.expires_at) < new Date()) return { valid: false, reason: "expired" };
    const { data: org } = await supabaseAdmin.from("organizations").select("hotel_name").eq("id", inv.organization_id).maybeSingle();
    return {
      valid: true,
      organizationId: inv.organization_id,
      hotelName: org?.hotel_name ?? "",
      email: inv.email,
      role: inv.role,
    };
  });

/** Accept an invitation as the currently signed-in user. */
export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(input))
  .handler(async ({ context, data }): Promise<{ organizationId: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, organization_id, email, role, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!inv) throw new Error("Invitation not found");
    if (inv.accepted_at) throw new Error("Invitation already accepted");
    if (new Date(inv.expires_at) < new Date()) throw new Error("Invitation expired");

    // Add caller as active member; ignore if already exists
    const { error: memErr } = await supabaseAdmin.from("organization_members").upsert({
      organization_id: inv.organization_id,
      user_id: context.userId,
      role: inv.role,
      status: "active",
    }, { onConflict: "organization_id,user_id" });
    if (memErr) throw new Error(memErr.message);

    // Grant hotel_admin role (informational)
    await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: inv.role }).select();

    await supabaseAdmin.from("organization_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
    await supabaseAdmin.from("subscription_history").insert({
      organization_id: inv.organization_id,
      action: "invitation_accepted",
      changed_by: context.userId,
      metadata: { email: inv.email } as any,
    });
    return { organizationId: inv.organization_id };
  });
