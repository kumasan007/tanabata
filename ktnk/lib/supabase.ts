import { createClient } from "@supabase/supabase-js";
import { getAdminCookieFromRequest, verifyAdminSessionToken } from "@/lib/admin-auth";

export function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !apiKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY を設定してください。");
  }

  return createClient(url, apiKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createAdminServerClient() {
  const url = process.env.SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "SUPABASE_URL と SUPABASE_SECRET_KEY（または SUPABASE_SERVICE_ROLE_KEY）を設定してください。",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function assertAdminFromRequest(request: Request) {
  return verifyAdminSessionToken(getAdminCookieFromRequest(request));
}
