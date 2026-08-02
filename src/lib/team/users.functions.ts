import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TeamRole = "hotel_admin" | "hotel_staff";

export interface TeamMember {
  userId: string;
  email: string;
  role: TeamRole;
  status: string;
  createdAt: string;
  isSelf: boolean;
  pendingInviteToken?: string | null;
  inviteExpiresAt?: string | null;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolves the caller's active org and asserts they are the hotel owner/admin. */
async function requireOwner(context: any): Promise<string> {
  const { data: membership } = await context.supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) throw new Error("No organization for user");
  if (membership.role !== "hotel_admin") throw new Error("Forbidden");
  return membership.organization_id as string;
}

export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamMember[]> => {
    const orgId = await requireOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: members }, { data: invites }] = await Promise.all([
      supabaseAdmin
        .from("organization_members")
        .select("user_id, role, status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("organization_invitations")
        .select("email, token, expires_at, accepted_at")
        .eq("organization_id", orgId)
        .is("accepted_at", null),
    ]);

    const rows: TeamMember[] = [];
    for (const m of members ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      const email = u?.user?.email ?? "";
      const invite = (invites ?? []).find((i) => i.email.toLowerCase() === email.toLowerCase());
      rows.push({
        userId: m.user_id,
        email,
        role: (m.role === "hotel_admin" ? "hotel_admin" : "hotel_staff") as TeamRole,
        status: m.status,
        createdAt: m.created_at,
        isSelf: m.user_id === context.userId,
        pendingInviteToken: invite?.token ?? null,
        inviteExpiresAt: invite?.expires_at ?? null,
      });
    }
    return rows;
  });

export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(200),
        role: z.enum(["hotel_admin", "hotel_staff"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ token: string; email: string }> => {
    const orgId = await requireOwner(context);
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const token = randomToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    const { error: invErr } = await supabaseAdmin.from("organization_invitations").insert({
      organization_id: orgId,
      email,
      role: data.role,
      token,
      expires_at: expires.toISOString(),
      created_by: context.userId,
    });
    if (invErr) throw new Error(invErr.message);

    // Pre-create the account in a pending state; the password is set by the
    // employee themselves through the activation link.
    const { data: created } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true });
    if (created?.user) {
      await supabaseAdmin.from("organization_members").upsert(
        { organization_id: orgId, user_id: created.user.id, role: data.role, status: "pending" },
        { onConflict: "organization_id,user_id" },
      );
    }

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "team_member_invited",
      email,
      organization_id: orgId,
      user_id: context.userId,
      detail: { role: data.role },
    });

    return { token, email };
  });

export const regenerateTeamInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().email().max(200) }).parse(input))
  .handler(async ({ context, data }): Promise<{ token: string }> => {
    const orgId = await requireOwner(context);
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, role")
      .eq("organization_id", orgId)
      .eq("email", email)
      .is("accepted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const token = randomToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("organization_invitations")
        .update({ token, expires_at: expires.toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("organization_invitations").insert({
        organization_id: orgId,
        email,
        role: "hotel_staff",
        token,
        expires_at: expires.toISOString(),
        created_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "team_invite_regenerated",
      email,
      organization_id: orgId,
      user_id: context.userId,
    });

    return { token };
  });

export const setTeamMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const orgId = await requireOwner(context);
    if (data.userId === context.userId) throw new Error("You cannot change your own access.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("organization_members")
      .select("user_id, role, status")
      .eq("organization_id", orgId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("Member not found");

    const { error } = await supabaseAdmin
      .from("organization_members")
      .update({ status: data.status })
      .eq("organization_id", orgId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("auth_audit_log").insert({
      action: data.status === "active" ? "team_member_reactivated" : "team_member_disabled",
      organization_id: orgId,
      user_id: context.userId,
      detail: { target_user_id: data.userId },
    });

    return { ok: true };
  });
