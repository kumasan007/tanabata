# ktnk 作業予定入力システム

建設現場の協力会社・職人向け作業予定入力システムです。

## 方針

- Next.js App Router / TypeScript / Tailwind CSS / shadcn/ui で作成する
- Vercel無料枠へのデプロイを想定する
- DBはSupabase PostgreSQLを使う
- 職人側フォームはログイン不要で完全公開にする
- 管理画面は共有パスワードでログイン必須にする
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
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
BOX_COMPANY_CSV_URL=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
EXCEL_FEED_TOKEN=
```

## Supabase

`supabase/schema.sql` をSupabase SQL Editorで実行します。

すでに初回スキーマを実行済みの場合は、追加で以下を実行します。

```sql
alter table public.schedule_groups
add column if not exists next_work_area text;
```

管理画面は `ADMIN_PASSWORD` の共有パスワードでログインします。
ログイン状態は48時間保持します。

### 環境変数の意味

`ADMIN_PASSWORD` は管理画面に入るための共有パスワードです。

`ADMIN_SESSION_SECRET` はログインCookieの改ざんを防ぐための秘密文字列です。管理者が入力するものではありません。長めのランダム文字列を入れてください。

例:

```text
ADMIN_SESSION_SECRET=change-this-to-a-long-random-string
```

`EXCEL_FEED_TOKEN` はExcelの「Webから」でCSV同期するときのURL用パスワードです。Excel側のURLに付けます。

例:

```text
EXCEL_FEED_TOKEN=change-this-too
https://your-vercel-domain.example/api/excel-feed?token=change-this-too
```

## Vercel

VercelではRoot Directoryを `ktnk` にします。

環境変数:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
BOX_COMPANY_CSV_URL
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
EXCEL_FEED_TOKEN
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

## 会社CSV

Boxに置く会社CSVは `company-master-template.csv` を元に作成します。

`BOX_COMPANY_CSV_URL` には、BoxのCSV共有ファイルURL、またはCSV本体を直接ダウンロードできる公開URLを設定してください。Box共有ファイルURLを使う場合は、フォルダではなくCSVファイル単体を共有し、ダウンロードを許可してください。

列:

```text
一次会社,職種,二次会社
```

複数職種を持つ一次会社は、職種を `・` で区切ります。

```text
空調メンテナンス,ダクト工・配管工,空調協力会
```

二次会社がない一次会社は、二次会社を空欄にします。

```text
搬入センター,揚重工,
```

会社名はアプリ側で正規化・統合しません。

## ExcelのWeb同期

Excelの「データ」タブから「Webから」を使う場合は、Supabase REST APIを直接読むのではなく、アプリ側のCSVフィードを使います。

```text
https://your-vercel-domain.example/api/excel-feed?token=EXCEL_FEED_TOKEN
```

日付範囲を指定する場合:

```text
https://your-vercel-domain.example/api/excel-feed?token=EXCEL_FEED_TOKEN&dateFrom=2026-09-04&dateTo=2026-09-10
```

未指定の場合は、日本時間の今日から14日分を返します。

## Excel運用

`excel/作業予定マスタ.xlsx` をマスタExcelの土台として使います。

取込マクロは `excel/vba/ImportSchedules.bas` に分けて置いています。この環境ではExcel本体の自動操作が使えないため、直接 `.xlsm` にマクロを埋め込んだ状態では作成していません。

詳細は [excel/README.md](excel/README.md) を参照してください。

## 設計メモ

今回決まった仕様と、後から変更すると影響が大きい点は [docs/design.md](docs/design.md) にまとめています。
