"use client";

import "./globals.css";

export default function GlobalError({ retry }: { retry: () => void }) {
  return <html lang="ja">
    <body>
      <title>画面を表示できませんでした | 北仲ツール</title>
      <main className="mx-auto max-w-2xl px-3 py-5 sm:px-4">
        <h1 className="page-title">画面を表示できませんでした</h1>
        <section className="panel grid gap-4 p-4 sm:p-6">
          <p role="alert" className="notice-error">通信状況を確認して、もう一度お試しください。</p>
          <button type="button" className="btn btn-primary" onClick={retry}>もう一度読み込む</button>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.assign("/")}>ホームに戻る</button>
        </section>
      </main>
    </body>
  </html>;
}
