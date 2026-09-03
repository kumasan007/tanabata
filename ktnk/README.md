# ktnk 作業予定入力システム

建設現場の協力会社・職人向け作業予定入力システムです。

## 方針

- Next.js App Router / TypeScript / Tailwind CSS / shadcn/ui で作成する
- Vercel無料枠へのデプロイを想定する
- DBはSupabase PostgreSQLを使う
- 職人側フォームはログイン不要で完全公開にする
- 管理画面はSupabase Authでログイン必須にする
- 現場は1つとして扱い、現場IDや現場選択は持たない
- 会社マスタはBox公開CSVを正とし、アプリ側ではキャッシュして利用する
- 同じ作業日・同じ一次会社の再送信は上書きする
- 送信履歴は残さない
- 入力締め時刻は20:00とする
- Excel出力は日付ごとにシートを分ける
- CSV出力も残し、既存Excelへ手動で貼り付け・新規シート追加できるようにする

## 開発

```bash
npm install
npm run dev
```

ローカルでは `.env.local` を作成して、以下を設定します。

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BOX_COMPANY_CSV_URL=
```

## Supabase

`supabase/schema.sql` をSupabase SQL Editorで実行します。

すでに初回スキーマを実行済みの場合は、追加で以下を実行します。

```sql
alter table public.schedule_groups
add column if not exists next_work_area text;
```

管理画面に入るユーザーは、Supabase Authでメールアドレスとパスワードを作成します。

## Vercel

VercelではRoot Directoryを `ktnk` にします。

環境変数:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
BOX_COMPANY_CSV_URL
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

## Excel運用

`excel/作業予定マスタ.xlsx` をマスタExcelの土台として使います。

取込マクロは `excel/vba/ImportSchedules.bas` に分けて置いています。この環境ではExcel本体の自動操作が使えないため、直接 `.xlsm` にマクロを埋め込んだ状態では作成していません。

詳細は [excel/README.md](excel/README.md) を参照してください。

## 設計メモ

今回決まった仕様と、後から変更すると影響が大きい点は [docs/design.md](docs/design.md) にまとめています。
