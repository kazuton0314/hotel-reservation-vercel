# データ同期ガイド

## データの正（Source of Truth）

| 期間 | 正 |
|------|-----|
| 移行完了まで（並行期） | 既存 GAS + 予約管理スプシ |
| 新アプリ切り替え後 | Supabase |

新アプリは**予約管理DBを日常の入力源にしません**。

## 入力経路

### 1. フォーム回答スプシ（継続）

| フォーム | スプシ ID（デフォルト） | 取込先テーブル |
|----------|-------------------------|----------------|
| STUDIO 本予約 | `11DhFnVRKTkeVFs5FAj78gL-2M5iEae8CKodxOUhMKAY` | `reservations` |
| 予約リクエスト | `1hKa89ds_DZbpxDxI9w0fU9R-UNjUGhnqyXKXLmsekuc` | `reservation_requests` |

- Sheets API で**回答スプシを直接**読み取る（IMPORTRANGE 中間シートは使わない）
- 取込済み管理は `form_import_log` テーブル（GAS の P/Q・AM/AN 列の代替）
- Vercel Hobby では **1日1回** Cron（`0 0 * * *` UTC ≒ 9:00 JST）が `/api/cron/sync-forms` を実行
- 手動: 設定 → 同期ステータス、または `npm run sync:forms`

### 2. 予約管理DB CSV（一度だけ）

切り替え前に、運用データを CSV で投入します。

| CSV 元シート | import ターゲット |
|--------------|-------------------|
| `03_予約台帳` | `reservations-active` |
| `07_予約台帳_アーカイブ` | `reservations-archive` |
| `02_予約リクエスト台帳` | `requests-active` |
| `06_…_アーカイブ` | `requests-archive` |
| `04_部屋割り` | `room-assignments-active` |
| `08_部屋割り_アーカイブ` | `room-assignments-archive` |
| `05_同行者情報` | `companions` |

```powershell
# スプシ: ファイル → ダウンロード → CSV
npm run import:csv -- reservations-active ./data/03_予約台帳.csv
npm run import:csv -- companions ./data/05_同行者情報.csv
```

CSV 投入後、`import_sequences` が台帳の最大 ID から連番を同期します。
**リクエスト台帳 CSV 投入後は `form_import_log` の backfill も必須です**（日次フォーム同期で既存行が二重取込されないようにするため）。

```powershell
npm run backfill:form-import-log
```

データ破損からの復旧（台帳 CSV または Supabase エクスポート）:

```powershell
npm run restore:requests -- ./data/reservation_requests_rows_before.csv ./data/reservation_requests_rows_after.csv
```

必要に応じて以下を実行してください。

```powershell
# 事後リンク（リクエスト↔本予約）
npm run link:records

# 顧客リスト再構築
npm run rebuild:customers
```

## 重複レコードの扱い（本番フォーム切替時）

- フォーム同期では、**同一人物（氏名＋連絡先）かつ同一日程**を重複候補として扱います。
- **既に DB にある行（import_row_id 一致 or 重複判定）は一切上書きしません。** `form_import_log` だけ付けてスキップします（リクエスト・本予約フォーム共通）。
- 既存の確定予約がある場合は既存 `reservation_id` を優先し、二重作成を抑止します。
- 既存リクエストがある場合は既存 `request_id` を優先し、`linked_reservation_id` 連携を維持します。
- チェックイン日の受付範囲は **今日から365日以内**（1年以上先は新規取込エラー）。年の繰り上げもこの範囲内でのみ行います。
- 既存データの整合は `npm run link:records` で後追い修復できます（アーカイブ本予約とのリンク・双方向修復含む）。

## サービスアカウントの共有先

**必須（読み取り）:**

- STUDIO 本予約フォームの回答スプシ
- 予約リクエストフォームの回答スプシ

**不要:**

- みどりの時計台_予約管理DB（日常同期しないため）

初期 CSV は手動エクスポートのため、サービスアカウント共有も不要です。

## 検証チェックリスト

### 初期 CSV 後

- [ ] `reservations` 件数 ≒ 03 + 07 の行数
- [ ] `room_assignments` に未割当以外のデータがある
- [ ] ランダム 10 件で予約ID・日付・ステータスが一致

### フォーム取込後

- [ ] 新規フォーム送信 → 5 分以内に Supabase に行が増える
- [ ] `form_import_log` に source_row が記録される
- [ ] 同じ行が二重取込されない

### UI

- [ ] `/reservations` に一覧表示
- [ ] `/reservations/[id]` で詳細表示
- [ ] `/settings/sync` で同期履歴確認

## 並行運用時の注意

- 旧 GAS でスタッフが部屋割・ステータスを変更しても、**新アプリには自動反映されません**
- 新フォーム回答は旧 GAS と新アプリの**両方**に入る（並行検証に利用可）
- 本番切り替え前に最終 CSV または短いメンテ時間でのフリーズを検討

## Phase 2 以降

- リクエスト一覧 UI
- 仮予約マッチング（StudioImport の上書きロジック）
- リクエスト ↔ 本予約の事後リンク
- 部屋割ボード・書き込み API
