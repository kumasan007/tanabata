import { createHmac } from "node:crypto";
import { assertAdminFromRequest, createServerClient } from "@/lib/supabase";

// High enough for bulk corrections at one site. These are abuse safeguards,
// not normal workflow quotas. Authenticated administrators bypass them.
const DEVICE_LIMIT = 300;
const SHARED_IP_LIMIT = 3_000;
const WINDOW_SECONDS = 10 * 60;

function hash(value: string) {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET ?? "ktnk-public-limit")
    .update(value)
    .digest("hex");
}

export async function publicMutationAllowed(request: Request, scope: string) {
  try {
    if (assertAdminFromRequest(request)) return true;
  } catch {
    // An invalid/missing admin session is treated as a public request.
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const suppliedDevice = request.headers.get("x-ktnk-device") ?? "";
  const device = /^[a-zA-Z0-9_-]{16,80}$/.test(suppliedDevice)
    ? suppliedDevice
    : `fallback:${request.headers.get("user-agent") ?? "unknown"}`;
  try {
    const { data, error } = await createServerClient().rpc("consume_public_mutation_limit", {
      p_scope: scope,
      p_device_key: hash(`${ip}:${device}`),
      p_ip_key: hash(ip),
      p_device_limit: DEVICE_LIMIT,
      p_ip_limit: SHARED_IP_LIMIT,
      p_window_seconds: WINDOW_SECONDS,
    });
    if (error) throw error;
    return data !== false;
  } catch {
    // Do not stop site work if the limiter table is temporarily unavailable.
    return true;
  }
}

export function mutationLimitResponse() {
  return Response.json(
    { error: "短時間に操作が集中しています。少し待ってからもう一度お試しください。" },
    { status: 429, headers: { "retry-after": "60" } },
  );
}
