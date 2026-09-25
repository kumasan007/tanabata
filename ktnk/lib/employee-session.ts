"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export const SESSION_CHANGED = "employee-session-changed";
export const OPEN_EMPLOYEE_LOGIN = "open-employee-login";
export function notifySessionChanged(authenticated: boolean) {
  window.dispatchEvent(new CustomEvent(SESSION_CHANGED, { detail: authenticated }));
  try { localStorage.setItem(SESSION_CHANGED, `${Date.now()}:${authenticated}`); } catch { /* Cookies remain the source of truth. */ }
}
export function useEmployeeSession(initial = false) {
  const [authenticated, setAuthenticated] = useState(initial);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      try {
        const response = await apiFetch("/api/admin/session", { cache: "no-store", dedupe: false });
        if (!response.ok) return;
        const body = await response.json();
        if (active && current === revision) setAuthenticated(body.authenticated === true);
      } catch { /* Keep the last known state during transient connection errors. */ }
    };
    const changed = (event: Event) => { ++revision; setAuthenticated((event as CustomEvent<boolean>).detail); };
    const storage = (event: StorageEvent) => { if (event.key === SESSION_CHANGED) void refresh(); };
    void refresh();
    window.addEventListener(SESSION_CHANGED, changed);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    return () => { active = false; window.removeEventListener(SESSION_CHANGED, changed); window.removeEventListener("focus", refresh); window.removeEventListener("storage", storage); };
  }, []);
  return authenticated;
}
