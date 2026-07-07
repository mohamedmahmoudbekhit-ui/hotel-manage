import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const stateSchema = z.object({
  hotelName: z.string().min(1).max(120),
  data: z.record(z.string(), z.unknown()),
  onboarded: z.boolean().optional(),
});

export const loadHotelState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("hotel_state")
      .select("hotel_name, onboarded, data")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { exists: false as const };
    return {
      exists: true as const,
      hotelName: data.hotel_name,
      onboarded: data.onboarded,
      data: data.data as Record<string, unknown>,
    };
  });

export const saveHotelState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stateSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("hotel_state")
      .upsert(
        {
          user_id: context.userId,
          hotel_name: data.hotelName,
          data: data.data,
          onboarded: data.onboarded ?? true,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
