# 03. スタッフ向け UI 仕様

共通: カードタップで詳細へ。トースト通知。ローディングオーバーレイ（サイレントAPI除く）。

---

## 3.1 ホーム (`dashboard`)

### 統計（タップで遷移）

| 表示 | 遷移先 |
|------|--------|
| 今日IN / 滞在中 / 今日OUT | 予定（日）または関連一覧 |
| リクエスト | リクエストタブ |
| 仮予約 / 確定 | 本予約タブ（該当フィルタ） |
| 同行者未回答 / メール未送付 / 部屋未割当 | 本予約（該当絞り込み） |

### アクション

| ボタン | API | 動作 |
|--------|-----|------|
| 予約をインポート | `apiSyncReservations` | リクエスト+STUDIO取込、ダッシュボード更新 |
| 予約を手動追加 | `apiCreateReservation` | サブ画面フォーム |
| メール定型文 | — | テンプレート管理サブ画面 |

### セクション

1. **部屋割（今日）** — 部屋別 IN/OUT/滞在、人数表示
2. **チェックイン n組** — 予約カード → 詳細
3. **チェックアウト n組**
4. **滞在中 n組** — 泊目表示あり

API: `apiGetAppBootstrap`（初回）、内包 `apiGetDashboard`

---

## 3.2 部屋割りボード (`rooms`)

### レイアウト

- 月ナビ: `←` / 年月ピッカー / `→` / **今月** / **全画面**
- 表: 縦=日付、横=**未割当** + 各部屋（`11_部屋マスタ`）
- セル内イベント表示順: **OUT → 同日IN/OUT → IN → 滞在**
- イベント表示: 代表者名、泊目ラベル、人数内訳、BBQバッジ
- CSS: `occ-checkin`, `occ-checkout`, `occ-stay`, `occ-turn`, `occ-provisional`, `occ-shared`（同室複数組）

### 閲覧モード

- イベントタップ → 本予約詳細

### 編集モード

1. **編集モード** ボタン → ベース状態スナップショット
2. D&Dで部屋間・未割当へ移動（デスクトップ: ドラッグ、タッチ: 長押し）
3. バー: `編集中 — N 件の変更` | **キャンセル** | **確定**
4. 確定: `apiBatchRoomAssignment`（共有部屋時は確認ダイアログ）
5. 空セルへドロップ → 新規部屋割 `apiCreateRoomAssignment`

API: `apiGetRoomOccupancyMonth(year, month)`

---

## 3.3 予定カレンダー (`calendar`)

### 表示モード

| モード | API | 内容 |
|--------|-----|------|
| 月 | `apiGetMonthCalendar` | 日別 IN/OUT/滞在バッジ、日タップ→日表示 |
| 週 | `apiGetWeekCalendar` | 週ストリップ + イベント |
| 日 | `apiGetDayCalendar` | チェックイン/アウト/滞在セクション、部屋サマリー |

ナビ: 前後、日付/月ジャンプモーダル

---

## 3.4 リクエスト一覧 (`request`)

### スコープ

| ボタン | データ源 |
|--------|----------|
| これからのリクエスト | `02_予約リクエスト台帳` |
| 過去のリクエスト | `06_アーカイブ` |

### ステータスタブ

`リクエスト` | `承認済` | `却下`  
（`本予約連携済` は承認済タブに含める）

### 検索バー（1行）

- **キーワード:** 名前・ふりがな・メール・電話・ID（部分一致、かな正規化）
- **チェックイン日:** 日付ピッカー
- **×** クリア、入力280msデバウンスで自動絞り込み

### 並び替え

| 基準 | デフォルト方向 |
|------|----------------|
| 滞在日 | 昇順 |
| 受付日 | **降順（デフォルト）** |
| 更新日 | 降順 |

### カード表示

代表者名、ステータスバッジ、（承認済/却下時）メール送付バッジ、リクエストID、日程、受付日時、宿泊人数

API: `apiGetRequestList(statusFilter, scope)`

---

## 3.5 リクエスト詳細 (`request-detail`)

### ステータス

- ステッパー: リクエスト → 承認済 | 却下
- チップでステータス変更（`apiUpdateRequestStatus`）

### クイック操作（ステータス別）

| 状態 | ボタン |
|------|--------|
| リクエスト | **承認**, **却下** |
| 承認済 + 連携あり | **予約を見る**, **連携を解除** |
| 承認済 + 未連携 | **仮予約を作成**, **本予約を紐づけ**, **リクエストに戻す** |
| 却下等 | **リクエストに戻す** |

承認時: 確認ダイアログ → 仮予約作成の追加確認（OK=作成、Cancel=承認のみ）

### メール（メールアドレスあり）

送付 / 送付済トグル — `apiSendMail`, `apiSetMailSentFlag`

### リクエスト内容（表示）

リクエストID, 受付日時, 代表者, ふりがな, グループ, メール, 電話, **この人の履歴**, 日程, 人数, 問い合わせ, 連携予約ID, 却下理由

**この人の履歴:** `openCustomersWithSearch_`（顧客画面へ、氏名・メール・電話プリフィル）

### 編集

ステータス選択 + **保存**

### 同期間の他組の予約

- `apiGetOverlappingStays(checkIn, checkOut, excludeLinkedId, anchorCheckIn)`
- **基準日（チェックイン日）** で IN / OUT / 滞在中 に分類表示（ホーム同様のタグ）
- **{チェックイン日} の予定画面を開く** → カレンダー日表示

### 本予約を紐づけモーダル

確定予約を検索・選択 → `apiLinkRequestToReservation`

---

## 3.6 本予約一覧 (`list`)

### スコープ

| ボタン | データ源 |
|--------|----------|
| これからの予約 | `03_予約台帳` |
| 過去の予約 | `07_アーカイブ` |

### ステータスタブ

`仮予約` | `確定` | `キャンセル`

### 検索バー

リクエスト一覧と同型（キーワード + チェックイン日）

### 絞り込み（ドロップダウン）

| 項目 | 値例 |
|------|------|
| 予約経路 | 自社サイト, Airbnb, … |
| 部屋割 | 未割当, 各部屋 |
| 支払い | 未払い, 完了 |
| 食事 / BBQ | マスタ値 |
| 同行者情報 | 未回答, 回答済 |
| メール | 未送付, 送付済 |

### 並び替え

滞在日（昇順・デフォルト）| 受付日（降順）| 更新日（降順）

### カード

代表者名、ステータス、各種バッジ（同行者・メール等）、予約ID、日程、受付日、人数内訳、部屋

API: `apiGetReservationList(period, query, scope)`

---

## 3.7 本予約詳細 (`detail`)

### ステータス

ステッパー: 仮予約 → 確定 | キャンセル  
**確定にする** / **キャンセルにする** — `apiQuickUpdateStatus`

### メール

- **仮予約:** 予約確定メール1種
- **確定:** 予約確定 / 11日前 / 3日前 — 各: バッジ、**送る**、送付済/未送付トグル

### 部屋割り

- 割当状況バッジ
- 行: 部屋名 / 人数 / 期間 / 編集・削除
- **部屋を追加**, **複数部屋を一括追加**
- API: `apiCreateRoomAssignment`, `apiUpdateRoomAssignment`, `apiDeleteRoomAssignment`, `apiBatchRoomAssignment`

### 同行者情報

- 状態: 不要 / 未回答 / 回答済み
- 回答済トグル、一覧（編集・削除）、**同行者を追加**
- API: `apiSetCompanionAnsweredFlag`, `apiAddCompanionEntries`, `apiUpdateCompanionEntry`, `apiDeleteCompanionEntry`
- 表示: 1行1人（氏名・ふりがな・年齢・性別）

### 同期間の他組の予約

リクエスト詳細と同様（IN/OUT/滞在中分類）

### 予約内容（読取）

予約ID, 受付日, 経路, 代表者, 連絡先, 宿泊, 食事・交通, 問い合わせ, アンケート, **この人の履歴**

### 編集フォーム

全項目編集 + **保存** — `apiUpdateReservation`（lite応答で詳細パッチ）

人数表示形式: `6(男2女2小男1幼1)` 等（`GuestDisplay`）

---

## 3.8 顧客 (`customers`)

### 検索

複数フィールド（OR検索）:

| フィールド | 説明 |
|------------|------|
| 名前 | 代表者・ふりがな・同行者名 |
| メール | 部分一致 |
| 電話 | 4桁以上で部分一致 |
| 予約ID | 部分一致 |
| 顧客ID | 部分一致 |

API: `apiSearchCustomers`, `apiGetCustomerDetail`

### 結果カード

代表者名、**リピーター**バッジ（来館2回以上）、来館回数、最終CO、連絡先

### 詳細

顧客情報 + 紐づく予約一覧（タップで本予約詳細）

### 他画面からの遷移

本予約/リクエスト詳細の **「この人の履歴」** → 検索条件プリフィルで本画面を開く

---

## 3.9 メール定型文 (`ClientMail`)

- 一覧 / 新規 / 編集 / 削除
- 種別: リクエスト / 本予約 / 共通
- 送信元: `tomaro@midorinotokeidai.com`（Gmail送信可アカウント要）

詳細画面からの送信モーダル: テンプレ選択 → プレビュー (`apiPreviewMail`) → 送信 (`apiSendMail`)

---

## 3.10 手動予約追加

ホームからサブ画面。必須: チェックイン/アウト、姓・名（代表者名）。  
API: `apiCreateReservation` → 成功時詳細へ

---

## API一覧（スタッフ）

| 機能 | 関数 |
|------|------|
| 初期化 | `apiGetAppBootstrap`, `apiReloadAppData` |
| 取込 | `apiSyncReservations` |
| ダッシュボード | `apiGetDashboard` |
| 本予約 | `apiGetReservationList`, `apiGetReservationDetail`, `apiCreateReservation`, `apiUpdateReservation`, `apiQuickUpdateStatus` |
| リクエスト | `apiGetRequestList`, `apiGetRequestDetail`, `apiUpdateRequestStatus`, `apiApproveRequest`, `apiRejectRequest`, `apiCreateProvisionalFromRequest`, `apiLinkRequestToReservation`, `apiUnlinkRequestFromReservation` |
| 部屋割 | `apiGetRoomOccupancyMonth`, `apiCreateRoomAssignment`, `apiUpdateRoomAssignment`, `apiDeleteRoomAssignment`, `apiBatchRoomAssignment` |
| 予定 | `apiGetMonthCalendar`, `apiGetWeekCalendar`, `apiGetDayCalendar` |
| 重複 | `apiGetOverlappingStays` |
| 同行者（スタッフ） | `apiSetCompanionAnsweredFlag`, `apiAddCompanionEntries`, … |
| 顧客 | `apiSearchCustomers`, `apiGetCustomerDetail` |
| メール | `apiSendMail`, `apiPreviewMail`, `apiSetMailSentFlag`, テンプレCRUD |
