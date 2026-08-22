# Supabase マイグレーション手順

SQL Editor で **番号順** に実行してください。

| 順 | ファイル | 内容 |
|----|----------|------|
| 1 | `001_initial.sql` | 予約・リクエスト・部屋割・form_import_log |
| 2 | `002_api_grants.sql` | API 権限（001 に含まれる場合はスキップ可） |
| 3 | `003_companions.sql` | 同行者テーブル |
| 4 | `004_auth_rls.sql` | スタッフ認証用 RLS（anon 書き込み禁止） |
| 5 | `005_mail_templates_customers.sql` | メール定型文・顧客テーブル |
| 6 | `006_search_indexes_realtime.sql` | 検索インデックス |
| 7 | `007_mail_logs.sql` | メール送信ログ |
| 8 | `008_mail_logs_provider_status.sql` | Resend 配信ステータス列 |
| 9 | `009_import_job_runs.sql` | script ジョブ履歴 |
| 10 | `010_perf_range_indexes.sql` | 検索・期間インデックス |
| 11 | `011_looker_analysis_views.sql` | Looker 初期 view（**正は 019**。履歴互換） |
| 12 | `012_guest_memo.sql` | 宿泊者メモ列 |
| 13 | `013_somen_rental.sql` | 流しそうめんレンタル列 |
| 14〜18 | `014`〜`018` | Looker view の経緯パッチ（**正は 019**） |
| **19** | **`019_rebuild_looker_minimal_views.sql`** | **Looker 分析の正（最小 4 view）。既存環境はこれを実行** |

Looker の使い方・粒度の説明は [`LOOKER_ANALYSIS.md`](./LOOKER_ANALYSIS.md) を参照。

## Looker 分析（019 以降）

正とする view は次の 4 本だけです。

1. `reservation_summary_view` … 予約 1 行  
2. `reservation_nightly_stay_view` … 予約×滞在夜（連泊・人泊）  
3. `room_daily_occupancy_view` … 部屋×稼働夜（稼働率）  
4. `reservation_travel_purpose_view` … 旅行目的の行分解  

月次集計や内訳の切り口は Looker 側で行います。view を増やさない。

## 何度も実行して大丈夫？

| ファイル | 再実行 |
|----------|--------|
| 001, 002, 003 | だいたい安全（`IF NOT EXISTS`） |
| 004 | **安全**（`drop policy if exists` 済み） |
| 005 | だいたい安全（定型文は `on conflict do nothing`） |
| 006〜009 | だいたい安全（`IF NOT EXISTS` / 列追加） |
| 019 | **安全**（旧分析 view を DROP して正 4 本を作り直す） |

**注意:** 001 を何度も流してもテーブルは消えませんが、**本番データ入りのDBで不用意に DROP 文があるSQLは実行しない**でください（今回の 004 はポリシー削除のみで、予約データは消しません）。

## Supabase の「destructive operations」警告について

004 には次のような文が含まれるため、警告が出ます。

- `drop policy ...`（古いアクセスルールの削除）
- `revoke ... from anon`（匿名ユーザーの書き込み禁止）

これは**意図した変更**です。スタッフログイン必須にするための設定なので、**Run を押して問題ありません**（003 を先に実行済みであることだけ確認）。

### `policy "dev_all_rooms" for table "rooms" already exists`

→ **001 を再実行した**場合に出ます。最新版 001 は `drop policy if exists` 済みなので、**もう一度 001 全体を実行**すれば通ります。テーブルやデータは消えません。

## 004 でよくあるエラー

### `relation "public.companions" does not exist`

→ **003 を先に実行** してください。

### `policy "staff_all_rooms" for table "rooms" already exists`

→ 004 を再実行した場合。最新版 004 は `drop policy if exists "staff_all_*"` 済みなので再実行可能です。

### `005` 実行後に 004 を実行した

→ 問題ありません。004 は companions まで対象。mail_templates / customers は 005 で別途 staff ポリシーが付きます。

## 実行済みか確認する SQL

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'reservations', 'companions', 'customers', 'mail_templates',
    'mail_logs', 'import_job_runs'
  )
order by table_name;
```
