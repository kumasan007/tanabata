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
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
```

Supabase接続はサーバー側のNext.js API routesに集約し、`SUPABASE_URL` と非公開の `SUPABASE_SECRET_KEY` を使用します。画面はログイン不要ですが、ブラウザからDBを直接操作する権限は付与しません。

管理画面のバックアップ機能だけは、非公開の `SUPABASE_SECRET_KEY`（`sb_secret_...`）または従来の `SUPABASE_SERVICE_ROLE_KEY` を使用します。この値はブラウザへ公開せず、ローカルの `.env.local` とVercelの環境変数だけに設定してください。

anonキー運用では公開キーを知る利用者がSupabase REST APIを直接操作できるため、管理画面のログインはアプリ画面とAPIに対する制御になります。DBへの直接操作も防止したい場合はservice role運用を使用してください。

## Supabase

### 2026-10-01のレビュー修正

既存DBでは `supabase/migrations/202610010001_review_fixes.sql` をSQL Editorで1回実行してからデプロイしてください。終了報告の版番号、予定の同時編集チェック、関連データを含む会社名変更、機材履歴取得、バックアップ対象・復元順序を更新します。既存データは保持します。

続けて `supabase/migrations/202610010002_atomic_flows.sql` を実行してください。新規入場の登録・編集、予定の削除・日付変更、会社の並べ替えを同時更新に対応させます。旧バックアップの階名が衝突した場合は、現在の機材が参照する階を「（復元前）」付きの名前で保持します。適用順は `001` → `002` → アプリのデプロイです。

バックアップは終了報告と立ち馬の個体情報も含むバージョン6です。旧バックアップに含まれない終了報告・立ち馬情報は復元時に保持します。旧バックアップで保存されていなかった過去の情報は復元できません。

終了報告の修正には、さらに `supabase/migrations/202610010003_completion_atomic.sql` を実行してください。会社・予定の確認と報告保存を一つのトランザクションにまとめます。適用順は `001` → `002` → `003` → アプリのデプロイです。

### 2026-09-15の予定保存更新

既存DBでは [202609150001_save_schedule_atomically.sql](supabase/migrations/202609150001_save_schedule_atomically.sql) をSupabase SQL Editorで1回実行してから、この版をデプロイしてください。予定・二次会社・高所作業車の保存と上書き確認を一つのトランザクションにまとめます。既存データは削除しません。未適用の場合、予定保存は追加SQLの案内を表示して停止します。

作業入力・新規入場の下書きはブラウザに保存・復元しません。カレンダーから選んだ日付・会社と、利用者が明示的に選ぶ前回コピーは引き続き使えます。

`supabase/schema.sql` をSupabase SQL Editorで実行します。

旧版の `schema.sql` を実行済みの場合は、`supabase/migrations/20260904_supabase_only_company_master.sql` を1回実行してください。会社マスタの既存データを保ったまま、行ID・表示順・重複防止・DB権限を更新します。この移行SQLをすでに実行済みの場合は、追加で `supabase/migrations/20260904_add_company_master_order.sql` を実行します。現在の `schema.sql` は再実行でも同じ更新を適用できます。

`new row violates row-level security policy` が出る場合は、既存データを残したまま `supabase/fix-rls-policies.sql` をSupabase SQL Editorで実行します。

バックアップ機能を追加する場合は、Supabase DashboardのCronを有効にしてから `supabase/migrations/20260907_add_daily_backups.sql` と、それ以降のバックアップ用マイグレーションをSQL Editorで順番に1回実行します。毎日14:59 UTC（日本時間23:59）に業務データを `data_backups` へ保存し、10日を過ぎたバックアップだけを自動削除します。管理画面やAPIからの手動削除はできません。

日次バックアップだけを保持し、変更ごとの操作履歴は保存しません。最新の `202609260001_security_and_simplification.sql` で操作履歴を削除し、ログイン回数制限とAPI経由のDBアクセスへ切り替えます。

公開の予定操作に共有Wi-Fi対応の緩やかな回数制限を適用するには、`202609270001_public_mutation_limits.sql` も続けて実行してください。未ログイン時だけ端末ごと300回/10分、回線全体3,000回/10分で制限し、管理者ログイン中は制限しません。同じWi-Fiからの通常作業や大量整理を妨げないための高い上限です。

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
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
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

### 機材ボード取得の最適化（2026-10-01）

アプリの更新前に、Supabase SQL Editor または通常のマイグレーション手順で
`supabase/migrations/202610010004_optimize_equipment_board_reads.sql` を適用してください。
既存データを変更せず、取得用RPCと履歴検索インデックスを追加します。
機材ボードはこのRPCを使用するため、SQL未適用のままアプリだけ更新しないでください。

DB取得を5回から1回にまとめ、履歴は各車両の最新状態と、選択日に希望している会社の
直近割当（最大2件/車両）だけ返します。割当の優先順位・希望台数制限は既存の共通処理で維持します。
SQLは再実行可能です。旧アプリとも共存できるため、DBを先に更新できます。

今回決まった仕様と、後から変更すると影響が大きい点は [docs/design.md](docs/design.md) にまとめています。
