# ktnk 作業予定入力システム

建設現場の協力会社・職人向け作業予定入力システムです。

## 方針

- Next.js App Router / TypeScript / Tailwind CSS / shadcn/ui で作成する
- Vercel無料枠へのデプロイを想定する
- DBはSupabase PostgreSQLを使う
- 職人側フォームはログイン不要で完全公開にする
- 管理画面は共有パスワードでログイン必須にする
- 現場は1つとして扱い、現場IDや現場選択は持たない
- 会社マスタを含むすべての業務データはSupabase PostgreSQLを正とする
- 同じ作業日・同じ一次会社の再送信は上書きする
- 送信履歴は残さない

業務データの流れは `ブラウザ → Next.js API routes → Supabase` に統一しています。Boxなどの外部ストレージからデータを取得・同期する処理はありません。

## 開発

```bash
npm install
npm run dev
```

ローカルでは `.env.local` を作成して、以下を設定します。

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
```

Supabase接続はサーバー側のNext.js API routesに集約し、`SUPABASE_URL` と `SUPABASE_ANON_KEY` を使用します。`supabase/migrations/20260904_allow_anon_app_access.sql` を実行して、必要なRLSポリシーを適用してください。

管理画面のバックアップ機能だけは、非公開の `SUPABASE_SECRET_KEY`（`sb_secret_...`）を使用します。この値はブラウザへ公開せず、ローカルの `.env.local` とVercelの環境変数だけに設定してください。

anonキー運用では公開キーを知る利用者がSupabase REST APIを直接操作できるため、管理画面のログインはアプリ画面とAPIに対する制御になります。DBへの直接操作も防止したい場合はservice role運用を使用してください。

## Supabase

`supabase/schema.sql` をSupabase SQL Editorで実行します。

旧版の `schema.sql` を実行済みの場合は、`supabase/migrations/20260904_supabase_only_company_master.sql` を1回実行してください。会社マスタの既存データを保ったまま、行ID・表示順・重複防止・DB権限を更新します。この移行SQLをすでに実行済みの場合は、追加で `supabase/migrations/20260904_add_company_master_order.sql` を実行します。現在の `schema.sql` は再実行でも同じ更新を適用できます。

`new row violates row-level security policy` が出る場合は、既存データを残したまま `supabase/fix-rls-policies.sql` をSupabase SQL Editorで実行します。

バックアップ機能を追加する場合は、Supabase DashboardのCronを有効にしてから `supabase/migrations/20260907_add_daily_backups.sql` をSQL Editorで1回実行します。毎日14:59 UTC（日本時間23:59）に業務データを `data_backups` へ保存します。

登録時にDB列・制約のズレで失敗する場合は、既存データを削除してよければ `supabase/reset-schema.sql` をSupabase SQL Editorで実行します。`schedule_groups` と `schedule_subcompanies` を作り直します。

管理画面は `ADMIN_PASSWORD` の共有パスワードでログインします。
ログイン状態は48時間保持します。

### 環境変数の意味

`ADMIN_PASSWORD` は管理画面に入るための共有パスワードです。

`ADMIN_SESSION_SECRET` はログインCookieの改ざんを防ぐための秘密文字列です。管理者が入力するものではありません。長めのランダム文字列を入れてください。

例:

```text
ADMIN_SESSION_SECRET=change-this-to-a-long-random-string
```

## Vercel

VercelではRoot Directoryを `ktnk` にします。

環境変数:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
```

Build Command:

```text
npm run build
```

Install Command:

```text
npm install
```

職人側フォームは `/`、管理画面は `/admin` です。

## 会社マスタ

会社名リストはSupabaseの `company_master` テーブルで管理します。管理画面の「協力会社一覧」タブから追加・編集・並び替え・削除でき、職人側フォームへ即時反映されます。追加時は一次会社を1回入力し、複数の二次会社を1行ずつまとめて登録できます。一覧の上下ボタンで並び替え、自動保存します。一次会社は配下の二次会社と一緒に移動し、二次会社は同じ一次会社内で並び替えられます。UUIDは行の内部識別にだけ使い、画面には表示しません。

二次会社がない一次会社は、二次会社を空欄にして登録します。同じ一次会社・二次会社の組み合わせは重複登録できません。

## 設計メモ

今回決まった仕様と、後から変更すると影響が大きい点は [docs/design.md](docs/design.md) にまとめています。
