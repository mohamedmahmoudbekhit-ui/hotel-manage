import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LoadResult {
  exists: boolean;
  hotelName: string;
  onboarded: boolean;
  data: any;
  organizationId: string | null;
  logoUrl?: string | null;
  subscriptionStatus?: string | null;
  accountStatus?: string | null;
  expiryDate?: string | null;
  renewalDate?: string | null;
  isSuperAdmin?: boolean;
}

const stateSchema = z.object({
  hotelName: z.string().min(1).max(120),
  data: z.any(),
  onboarded: z.boolean().optional(),
});

async function resolveCurrentOrg(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export const loadHotelState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoadResult> => {
    // Super admin?
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isSuperAdmin = !!roleRows?.some((r: any) => r.role === "super_admin");

    const orgId = await resolveCurrentOrg(context.supabase, context.userId);
    if (!orgId) {
      return { exists: false, hotelName: "", onboarded: false, data: null, organizationId: null, isSuperAdmin };
    }

    const [{ data: stateRow }, { data: orgRow }] = await Promise.all([
      context.supabase.from("hotel_state").select("hotel_name, onboarded, data").eq("organization_id", orgId).maybeSingle(),
      context.supabase.from("organizations").select("hotel_name, logo_url, subscription_status, account_status, expiry_date, renewal_date").eq("id", orgId).maybeSingle(),
    ]);

    return {
      exists: !!stateRow,
      hotelName: stateRow?.hotel_name || orgRow?.hotel_name || "",
      onboarded: !!stateRow?.onboarded,
      data: stateRow?.data ?? null,
      organizationId: orgId,
      logoUrl: orgRow?.logo_url ?? null,
      subscriptionStatus: orgRow?.subscription_status ?? null,
      accountStatus: orgRow?.account_status ?? null,
      expiryDate: orgRow?.expiry_date ?? null,
      renewalDate: orgRow?.renewal_date ?? null,
      isSuperAdmin,
    };
  });

export const saveHotelState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const orgId = await resolveCurrentOrg(context.supabase, context.userId);
    if (!orgId) throw new Error("No organization for user");
    const { error } = await context.supabase
      .from("hotel_state")
      .upsert(
        {
          organization_id: orgId,
          hotel_name: data.hotelName,
          data: data.data as any,
          onboarded: data.onboarded ?? true,
        },
        { onConflict: "organization_id" },
      );
    if (error) throw new Error(error.message);
    // Keep organizations.hotel_name in sync
    await context.supabase.from("organizations").update({ hotel_name: data.hotelName }).eq("id", orgId);
    return { ok: true };
  });

export const updateOrgLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ logoUrl: z.string().url().max(2000).nullable() }).parse(input))
  .handler(async ({ context, data }) => {
    const orgId = await resolveCurrentOrg(context.supabase, context.userId);
    if (!orgId) throw new Error("No organization for user");
    const { error } = await context.supabase.from("organizations").update({ logo_url: data.logoUrl }).eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
