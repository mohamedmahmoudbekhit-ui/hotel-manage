export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          updated_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auth_audit_log: {
        Row: {
          action: string
          created_at: string
          detail: Json
          email: string | null
          id: string
          organization_id: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json
          email?: string | null
          id?: string
          organization_id?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json
          email?: string | null
          id?: string
          organization_id?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sources: {
        Row: {
          color: string
          created_at: string
          ical_url: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          organization_id: string
          platform_type: string
          room_id: string
          source_name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          ical_url: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          organization_id: string
          platform_type?: string
          room_id: string
          source_name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          ical_url?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          organization_id?: string
          platform_type?: string
          room_id?: string
          source_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sources_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_state: {
        Row: {
          created_at: string
          data: Json
          hotel_name: string
          onboarded: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          hotel_name?: string
          onboarded?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          hotel_name?: string
          onboarded?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ical_reservation_overrides: {
        Row: {
          created_at: string
          hidden: boolean
          id: string
          notes: string | null
          organization_id: string
          price: number | null
          reservation_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          id?: string
          notes?: string | null
          organization_id: string
          price?: number | null
          reservation_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hidden?: boolean
          id?: string
          notes?: string | null
          organization_id?: string
          price?: number | null
          reservation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ical_reservation_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ical_reservation_overrides_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "ical_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      ical_reservations: {
        Row: {
          end_date: string
          external_uid: string
          id: string
          imported_at: string
          organization_id: string
          platform_type: string
          room_id: string
          source_id: string
          start_date: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          end_date: string
          external_uid: string
          id?: string
          imported_at?: string
          organization_id: string
          platform_type?: string
          room_id: string
          source_id: string
          start_date: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          end_date?: string
          external_uid?: string
          id?: string
          imported_at?: string
          organization_id?: string
          platform_type?: string
          room_id?: string
          source_id?: string
          start_date?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ical_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ical_reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ical_reservations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "calendar_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          account_status: string
          contact_email: string
          contact_mobile: string
          contact_person: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          hotel_name: string
          id: string
          logo_url: string | null
          notes: string | null
          renewal_date: string | null
          start_date: string
          subscription_plan: string
          subscription_status: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          contact_email: string
          contact_mobile: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          hotel_name: string
          id?: string
          logo_url?: string | null
          notes?: string | null
          renewal_date?: string | null
          start_date?: string
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          contact_email?: string
          contact_mobile?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          hotel_name?: string
          id?: string
          logo_url?: string | null
          notes?: string | null
          renewal_date?: string | null
          start_date?: string
          subscription_plan?: string
          subscription_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_subscription_plan_fkey"
            columns: ["subscription_plan"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          room_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          room_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          room_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          metadata: Json
          new_status: string | null
          old_status: string | null
          organization_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          organization_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          features: Json
          is_active: boolean
          monthly_price_cents: number
          name: string
          sort_order: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          features?: Json
          is_active?: boolean
          monthly_price_cents?: number
          name: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          features?: Json
          is_active?: boolean
          monthly_price_cents?: number
          name?: string
          sort_order?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      super_admin_emails: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: { _user_id: string }; Returns: string }
      ensure_super_admin_self: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "hotel_admin" | "hotel_staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "hotel_admin", "hotel_staff"],
    },
  },
} as const
