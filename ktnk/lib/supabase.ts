import { createClient } from "@supabase/supabase-js";
import { getAdminCookieFromRequest, verifyAdminSessionToken } from "@/lib/admin-auth";

export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  // All database access stays on the server. Public pages remain login-free,
  // but callers can no longer bypass API validation with the browser anon key.
  const apiKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !apiKey) {
    throw new Error(
      "SUPABASE_URL と SUPABASE_SECRET_KEY（またはSUPABASE_SERVICE_ROLE_KEY）を設定してください。",
    );
  }

  return createClient(url, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createAdminServerClient() {
  return createServerClient();
}

export function assertAdminFromRequest(request: Request) {
  return verifyAdminSessionToken(getAdminCookieFromRequest(request));
}
