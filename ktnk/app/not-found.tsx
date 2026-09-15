import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto max-w-2xl px-3 py-5 sm:px-4">
    <h1 className="page-title">ページが見つかりません</h1>
    <section className="panel grid gap-4 p-4 sm:p-6">
      <p className="text-slate-600">URLを確認するか、ホームから目的の画面を選んでください。</p>
      <Link href="/" className="btn btn-primary">ホームに戻る</Link>
    </section>
  </main>;
}
