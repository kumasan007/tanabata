import { createClient } from "@supabase/supabase-js";
import { getAdminCookieFromRequest, verifyAdminSessionToken } from "@/lib/admin-auth";

export function createServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are not set.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function assertAdminFromRequest(request: Request) {
  return verifyAdminSessionToken(getAdminCookieFromRequest(request));
}
