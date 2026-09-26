"use client";

import { useEffect, useState } from "react";

export function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (online) return null;
  return (
    <div className="sticky top-0 z-50 bg-amber-100 px-3 py-2 text-center text-sm font-semibold text-amber-950" role="status">
      オフラインです。入力内容はこの端末に一時保存され、通信が戻ってから送信できます。
    </div>
  );
}
