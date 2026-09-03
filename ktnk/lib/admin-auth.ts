import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "ktnk_admin";
export const ADMIN_SESSION_SECONDS = 48 * 60 * 60;
const SESSION_MS = ADMIN_SESSION_SECONDS * 1000;

export type AdminSession = {
  exp: number;
};

export function adminCookieName() {
  return COOKIE_NAME;
}

export function createAdminSessionToken() {
  const payload: AdminSession = {
    exp: Date.now() + SESSION_MS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("ADMIN_PASSWORD is not set.");
  }

  return safeEqual(password, expected);
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return false;

  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  if (!safeEqual(signature, sign(body))) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as AdminSession;
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function getAdminCookieFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const pairs = cookie.split(";").map((part) => part.trim());
  const pair = pairs.find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return pair ? decodeURIComponent(pair.slice(COOKIE_NAME.length + 1)) : null;
}

function sign(body: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not set.");
  }

  return createHmac("sha256", secret).update(body).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}
