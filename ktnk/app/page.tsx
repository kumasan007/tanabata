import Link from "next/link";
import { CalendarDays, ClipboardList, ShieldCheck, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const menus = [
    { href: "/schedule", title: "作業入力", description: "日程・人数・作業内容を入力、修正", icon: ClipboardList },
    { href: "/new-entrants", title: "新規入場", description: "初めて入る会社・人を登録", icon: UserPlus },
    { href: "/calendar", title: "カレンダー", description: "みんなの予定と作業を確認", icon: CalendarDays },
  ];
  return <div className="min-h-screen">
    <header className="border-b border-border bg-white">
      <div className="mx-auto max-w-2xl px-4 py-5"><h1 className="text-xl font-bold">作業予定管理</h1></div>
    </header>
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h2 className="text-2xl font-bold">メニュー</h2>
      <p className="mt-2 text-slate-600">行う作業を選んでください。</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {menus.map(({ href, title, description, icon: Icon }) => <Link key={href} href={href} className="panel flex min-h-40 flex-col p-5 transition hover:border-emerald-400 hover:bg-emerald-50/40">
          <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
          <span className="mt-4 text-lg font-bold">{title}</span>
          <span className="mt-1 text-sm leading-6 text-slate-600">{description}</span>
        </Link>)}
      </div>
      <Link href="/admin" className="mt-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary"><ShieldCheck className="h-4 w-4" />管理者はこちら</Link>
    </main>
  </div>;
}
