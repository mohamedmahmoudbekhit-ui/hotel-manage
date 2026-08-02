import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  if (!data) throw new Error("Forbidden: super admin only");
}

export interface OrgRow {
  id: string;
  hotel_name: string;
  logo_url: string | null;
  contact_person: string | null;
  contact_email: string;
  contact_mobile: string;
  subscription_plan: string;
  subscription_status: string;
  account_status: string;
  start_date: string;
  renewal_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string;
  owner_status: "pending" | "active" | "expired";
  invitation_created_at: string | null;
  activated_at: string | null;
  invitation_token: string | null;
}

export interface DashboardStats {
  total: number;
  active: number;
  trial: number;
  expired: number;
  suspended: number;
  mrrCents: number;
}

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgRow[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id, hotel_name, logo_url, contact_person, contact_email, contact_mobile, subscription_plan, subscription_status, account_status, start_date, renewal_date, expiry_date, notes, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const orgs = (data ?? []) as any[];
    if (orgs.length === 0) return [];

    const ids = orgs.map((o) => o.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: invites }, { data: members }] = await Promise.all([
      supabaseAdmin
        .from("organization_invitations")
        .select("organization_id, email, role, token, created_at, accepted_at, expires_at")
        .in("organization_id", ids)
        .eq("role", "hotel_admin")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("organization_members")
        .select("organization_id, role, status")
        .in("organization_id", ids)
        .eq("role", "hotel_admin"),
    ]);

    const now = Date.now();
    return orgs.map((o) => {
      const orgInvites = (invites ?? []).filter((i: any) => i.organization_id === o.id);
      const accepted = orgInvites.filter((i: any) => i.accepted_at);
      const isActive =
        (members ?? []).some((m: any) => m.organization_id === o.id && m.status === "active") || accepted.length > 0;
      const latest = orgInvites[0] ?? null;
      const owner_status: OrgRow["owner_status"] = isActive
        ? "active"
        : latest && new Date(latest.expires_at).getTime() > now
          ? "pending"
          : "expired";
      return {
        ...o,
        owner_name: o.contact_person ?? null,
        owner_email: o.contact_email,
        owner_status,
        invitation_created_at: latest?.created_at ?? null,
        activated_at: accepted.length ? accepted[0].accepted_at : null,
        invitation_token: owner_status === "active" ? null : (latest?.token ?? null),
      } as OrgRow;
    });
  });


export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardStats> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const [{ data: orgs }, { data: plans }] = await Promise.all([
      context.supabase.from("organizations").select("subscription_status, account_status, subscription_plan"),
      context.supabase.from("subscription_plans").select("code, monthly_price_cents"),
    ]);
    const priceByCode = new Map<string, number>((plans ?? []).map((p: any) => [p.code, p.monthly_price_cents]));
    let total = 0, active = 0, trial = 0, expired = 0, suspended = 0, mrr = 0;
    for (const o of orgs ?? []) {
      total++;
      const s = (o as any).subscription_status;
      const a = (o as any).account_status;
      if (s === "trial") trial++;
      if (s === "expired") expired++;
      if (a === "suspended" || s === "suspended") suspended++;
      if (s === "active") { active++; mrr += priceByCode.get((o as any).subscription_plan) ?? 0; }
    }
    return { total, active, trial, expired, suspended, mrrCents: mrr };
  });

const createSchema = z.object({
  hotel_name: z.string().trim().min(1).max(200),
  contact_email: z.string().trim().email().max(200),
  contact_mobile: z.string().trim().max(50).optional(),
  contact_person: z.string().trim().min(1).max(200),
  subscription_plan: z.string().trim().min(1).max(50),
  notes: z.string().max(2000).optional(),
});

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ context, data }): Promise<{ id: string; inviteToken: string }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    {
      const { assertNotPlatformAdminEmail } = await import("@/lib/auth/platform-admin.server");
      await assertNotPlatformAdminEmail(data.contact_email);
    }
    const { data: plan } = await context.supabase.from("subscription_plans").select("code, trial_days").eq("code", data.subscription_plan).maybeSingle();

    const trialDays = plan?.trial_days ?? 14;
    const today = new Date();
    const expiry = new Date(today);
    expiry.setDate(expiry.getDate() + trialDays);
    const isTrial = trialDays > 0;

    const { data: inserted, error } = await context.supabase.from("organizations").insert({
      hotel_name: data.hotel_name,
      contact_email: data.contact_email,
      contact_mobile: data.contact_mobile || "",
      contact_person: data.contact_person,
      subscription_plan: data.subscription_plan,
      subscription_status: isTrial ? "trial" : "active",
      account_status: "active",
      start_date: today.toISOString().slice(0, 10),
      expiry_date: isTrial ? expiry.toISOString().slice(0, 10) : null,
      renewal_date: expiry.toISOString().slice(0, 10),
      notes: data.notes || null,
      created_by: context.userId,
    }).select("id").single();
    if (error || !inserted) throw new Error(error?.message ?? "Failed to create");

    // History entry
    await context.supabase.from("subscription_history").insert({
      organization_id: inserted.id,
      action: "created",
      new_status: isTrial ? "trial" : "active",
      changed_by: context.userId,
    });

    // Invitation
    const token = randomToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);
    const { error: invErr } = await context.supabase.from("organization_invitations").insert({
      organization_id: inserted.id,
      email: data.contact_email,
      role: "hotel_admin",
      token,
      expires_at: expires.toISOString(),
      created_by: context.userId,
    });
    if (invErr) throw new Error(invErr.message);

    // Create the owner account up-front in a pending state so it exists before
    // activation. The password is only ever set by the owner themselves.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: createdUser } = await supabaseAdmin.auth.admin.createUser({
      email: data.contact_email,
      email_confirm: true,
    });
    if (createdUser?.user) {
      await supabaseAdmin.from("organization_members").upsert({
        organization_id: inserted.id,
        user_id: createdUser.user.id,
        role: "hotel_admin",
        status: "pending",
      }, { onConflict: "organization_id,user_id" });
    }

    await supabaseAdmin.from("auth_audit_log").insert({
      action: "activation_invited",
      email: data.contact_email,
      organization_id: inserted.id,
      user_id: context.userId,
      detail: { hotel_name: data.hotel_name, expires_at: expires.toISOString() },
    });

    return { id: inserted.id, inviteToken: token };
  });


export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    patch: z.object({
      hotel_name: z.string().min(1).max(200).optional(),
      contact_person: z.string().max(200).nullable().optional(),
      contact_email: z.string().email().max(200).optional(),
      contact_mobile: z.string().min(3).max(50).optional(),
      subscription_plan: z.string().max(50).optional(),
      subscription_status: z.enum(["trial","active","expired","suspended","cancelled"]).optional(),
      account_status: z.enum(["active","suspended"]).optional(),
      renewal_date: z.string().nullable().optional(),
      expiry_date: z.string().nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }),
  }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: prev } = await context.supabase.from("organizations").select("subscription_status, account_status").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("organizations").update(data.patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.patch.subscription_status || data.patch.account_status) {
      await context.supabase.from("subscription_history").insert({
        organization_id: data.id,
        action: "updated",
        old_status: (prev as any)?.subscription_status ?? null,
        new_status: data.patch.subscription_status ?? (prev as any)?.subscription_status ?? null,
        changed_by: context.userId,
      });
    }
    return { ok: true };
  });

export const extendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid(),
    newExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("organizations").update({
      expiry_date: data.newExpiry,
      renewal_date: data.newExpiry,
      subscription_status: "active",
      account_status: "active",
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await context.supabase.from("subscription_history").insert({
      organization_id: data.id,
      action: "extended",
      new_status: "active",
      metadata: { new_expiry: data.newExpiry } as any,
      changed_by: context.userId,
    });
    return { ok: true };
  });

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("organizations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOrganizationDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const [{ data: org }, { data: members }, { data: history }, { data: invitations }] = await Promise.all([
      context.supabase.from("organizations").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("organization_members").select("id, user_id, role, status, created_at").eq("organization_id", data.id),
      context.supabase.from("subscription_history").select("*").eq("organization_id", data.id).order("created_at", { ascending: false }).limit(50),
      context.supabase.from("organization_invitations").select("id, email, role, token, expires_at, accepted_at, created_at").eq("organization_id", data.id).order("created_at", { ascending: false }),
    ]);
    if (!org) throw new Error("Not found");
    return { org, members: members ?? [], history: history ?? [], invitations: invitations ?? [] };
  });

export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organization_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<{ token: string; email: string }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: org } = await context.supabase.from("organizations").select("contact_email").eq("id", data.organization_id).maybeSingle();
    if (!org) throw new Error("Org not found");
    const token = randomToken();
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);
    const { error } = await context.supabase.from("organization_invitations").insert({
      organization_id: data.organization_id,
      email: (org as any).contact_email,
      role: "hotel_admin",
      token,
      expires_at: expires.toISOString(),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("auth_audit_log").insert({
      action: "activation_link_regenerated",
      email: (org as any).contact_email,
      organization_id: data.organization_id,
      user_id: context.userId,
      detail: { expires_at: expires.toISOString() },
    });
    return { token, email: (org as any).contact_email };
  });

export const listSubscriptionPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("subscription_plans")
      .select("code, name, monthly_price_cents, trial_days")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return (data ?? []) as { code: string; name: string; monthly_price_cents: number; trial_days: number }[];
  });
