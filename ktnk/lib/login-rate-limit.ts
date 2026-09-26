import { createHmac } from "node:crypto";
import { createAdminServerClient } from "@/lib/supabase";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const localAttempts = new Map<string, number[]>();

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || "unknown";
  const secret = process.env.ADMIN_SESSION_SECRET ?? "ktnk-rate-limit";
  return createHmac("sha256", secret).update(source).digest("hex");
}

export async function loginAllowed(request: Request) {
  const key = clientKey(request);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  try {
    const { count, error } = await createAdminServerClient()
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_key", key)
      .gte("attempted_at", since);
    if (error) throw error;
    return { allowed: (count ?? 0) < MAX_FAILURES, key };
  } catch {
    const recent = (localAttempts.get(key) ?? []).filter(
      (time) => time >= Date.now() - WINDOW_MINUTES * 60_000,
    );
    localAttempts.set(key, recent);
    return { allowed: recent.length < MAX_FAILURES, key };
  }
}

export async function recordLoginFailure(key: string) {
  try {
    const db = createAdminServerClient();
    await db.from("admin_login_attempts").insert({ client_key: key });
    await db
      .from("admin_login_attempts")
      .delete()
      .lt("attempted_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  } catch {
    localAttempts.set(key, [...(localAttempts.get(key) ?? []), Date.now()]);
  }
}

export async function clearLoginFailures(key: string) {
  localAttempts.delete(key);
  try {
    await createAdminServerClient()
      .from("admin_login_attempts")
      .delete()
      .eq("client_key", key);
  } catch {
    // The in-memory fallback is enough while the migration is being applied.
  }
}
