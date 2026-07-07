import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LoadResult {
  exists: boolean;
  hotelName: string;
  onboarded: boolean;
  data: any;
}

const stateSchema = z.object({
  hotelName: z.string().min(1).max(120),
  data: z.any(),
  onboarded: z.boolean().optional(),
});

export const loadHotelState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LoadResult> => {
    const { data, error } = await context.supabase
      .from("hotel_state")
      .select("hotel_name, onboarded, data")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { exists: false, hotelName: "", onboarded: false, data: null };
    return {
      exists: true,
      hotelName: data.hotel_name,
      onboarded: data.onboarded,
      data: data.data,
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
          data: data.data as any,
          onboarded: data.onboarded ?? true,
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
