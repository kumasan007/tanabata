"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">("hidden");
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationKey = `${pathname}?${searchParams}`;
  const completedLocation = useRef(locationKey);

  useEffect(() => {
    completedLocation.current = locationKey;
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPhase((current) => current === "hidden" ? current : "leaving");
    hideTimer.current = setTimeout(() => setPhase("hidden"), 180);
  }, [locationKey]);

  useEffect(() => {
    const start = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setPhase("hidden");
      showTimer.current = setTimeout(() => setPhase("visible"), 500);
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || (target.target && target.target !== "_self") || target.hasAttribute("download")) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      start();
    };
    const onPopState = () => {
      // Hash-only and same-URL history entries do not commit a new route.
      if (`${location.pathname}?${new URLSearchParams(location.search)}` !== completedLocation.current) start();
    };
    const onPageShow = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setPhase("hidden");
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (phase === "hidden") return null;
  return <div className={`navigation-feedback ${phase === "leaving" ? "is-leaving" : ""}`} role="status" aria-live="polite" aria-label="ページを読み込み中"><span /></div>;
}
