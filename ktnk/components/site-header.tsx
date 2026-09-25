"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EmployeeAccount } from "@/components/employee-account";

const navigation = [
  { href: "/schedule", label: "作業入力" },
  { href: "/new-entrants", label: "新規入場" },
  { href: "/calendar", label: "カレンダー" },
  { href: "/work-completion", label: "作業終了" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white pt-[env(safe-area-inset-top)] shadow-sm">
      <div className="mx-auto flex min-h-12 max-w-6xl items-center gap-1 px-2 sm:min-h-16 sm:justify-between sm:gap-4 sm:px-4">
        <div className="flex shrink-0 items-center">
          <Link href="/" className="rounded-md px-1 text-base font-bold leading-none text-slate-950 hover:text-primary sm:px-0 sm:text-xl">
            <span className="sm:hidden">北仲</span>
            <span className="hidden sm:inline">北仲ツール</span>
          </Link>
        </div>
        {pathname !== "/" ? (
          <nav className="ml-auto grid min-w-0 flex-1 grid-cols-4 gap-0.5 sm:flex sm:flex-none sm:gap-1" aria-label="メインメニュー">
            {navigation.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={active ? (event) => {
                    event.preventDefault();
                    if (window.location.search) {
                      window.location.assign(item.href);
                    } else {
                      window.location.reload();
                    }
                  } : undefined}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 min-w-0 items-center justify-center rounded-md px-1 text-center text-xs font-bold leading-tight transition-colors sm:px-4 sm:text-base ${active ? "bg-emerald-800 text-white" : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-900"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
        <EmployeeAccount />
      </div>
    </header>
  );
}
