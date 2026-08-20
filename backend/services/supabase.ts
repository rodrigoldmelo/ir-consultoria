import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { config } from "../config.js";

let adminClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

/** Returns admin client or null when IR_SUPABASE_* is not set. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: ws as never },
      },
    );
  }
  return adminClient;
}
