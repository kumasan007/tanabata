"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/schedule", label: "作業入力" },
  { href: "/new-entrants", label: "新規入場" },
  { href: "/calendar", label: "カレンダー" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto max-w-6xl sm:flex sm:min-h-16 sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-h-14 items-center px-4 sm:px-0">
          <Link href="/" className="rounded-md text-xl font-bold text-slate-950 hover:text-primary">
            北仲ツール
          </Link>
        </div>
        <nav className="grid grid-cols-3 gap-1 border-t border-border px-2 py-2 sm:flex sm:border-0 sm:p-0" aria-label="メインメニュー">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-12 items-center justify-center rounded-md px-2 text-center text-base font-bold transition-colors sm:px-4 ${active ? "bg-emerald-800 text-white" : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-900"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
