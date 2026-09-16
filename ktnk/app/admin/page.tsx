import "@/components/admin/admin-controls.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { adminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { AdminDashboard } from "@/components/admin-dashboard";

export const metadata: Metadata = {
  title: "監理者ページ | 北仲ツール",
  description: "協力会社とバックアップの管理。",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const cookieStore = await cookies();
  let authenticated = false;
  try { authenticated = verifyAdminSessionToken(cookieStore.get(adminCookieName())?.value); } catch { /* Show login if session verification is unavailable. */ }
  return <AdminDashboard initialAuthenticated={authenticated} />;
}
