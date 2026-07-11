# 05. 取込・同期・アーカイブ

---

## 5.1 リクエスト取込 (`RequestImport.js`)

### ソース

`00_予約リクエスト取込` — IMPORTRANGE 15列 + P列(取込済) + Q列(取込日時)

### 条件

- 取込済 ≠ TRUE
- 取込行IDが台帳に未存在
- 姓・チェックイン月が必須

### 処理

1. `02_予約リクエスト台帳` に行追加
2. `リクエストID` 採番、`外部受付キー` 新規発行
3. ステータス = **リクエスト**
4. 00シートに取込済・日時を書き込み

### トリガー

- スプレッドシートを開いたとき（`runImportOnSpreadsheetOpen`）
- 5分間隔スケジュール
- メニュー「予約データを取り込む」
- ホーム「予約をインポート」

※ Webアプリ起動時の自動取込は **無効** (`runImportOnWebAppOpen: false`)

---

## 5.2 STUDIO本予約取込 (`StudioImport.js`)

### ソース

`01_本予約取込` — IMPORTRANGE 38列 + AM(取込済) + AN(取込日時)

### 1行あたりの分岐

```
取込行読込
  ├─ 同日+連絡先+姓名で 仮予約 マッチ?
  │     └─ YES → 仮予約行をSTUDIOデータで上書き、ステータス=確定、IDは仮予約のまま
  └─ NO → 03_に新規行（STUDIO-MT* ID）
        └─ 02_でリクエストマッチ?
              └─ YES → 外部受付キー・リクエストID引継ぎ、連携予約ID更新、承認済へ
```

### 取込後

- 顧客索引 upsert（`CustomerIndexService`）
- GCal同期フック
- `relinkUnmatchedReservationsToRequests_`（未紐づけ本予約の再リンク）

### 初回一括（ブートストラップ）

台帳空の状態での大量取込時: `MIG-RQ*` / `MIG-MT*` ID（通常連番を消費しない）

---

## 5.3 マッチングロジック

関数: `bookingEntryMatchesForLink_` / `guestIdentityMatchesForLink_`

**すべて必須:**

1. **チェックイン日** — 完全一致、または月日一致（年ズレ救済）
2. **姓名** — 代表者名 or 姓+名（空白除去後一致）
3. **連絡先** — メール一致 **OR** 電話一致（10桁以上、末尾10桁比較可）

用途: STUDIO↔リクエスト、STUDIO↔仮予約、取込後リリンク

---

## 5.4 リクエスト承認フロー

| 操作 | API | 結果 |
|------|-----|------|
| 承認（仮予約あり） | `apiApproveRequest` | 02=承認済、03に仮予約行 |
| 承認のみ | 同上 createProvisional=false | 02=承認済のみ |
| 却下 | `apiRejectRequest` | 02=却下 |
| 仮予約後から作成 | `apiCreateProvisionalFromRequest` | 03仮予約 |
| 本予約手動紐づけ | `apiLinkRequestToReservation` | 連携予約ID設定 |
| 連携解除 | `apiUnlinkRequestFromReservation` | 連携予約IDクリア |
| 差し戻し | `apiUpdateRequestStatus` → リクエスト | 仮予約削除（確定は残す） |

---

## 5.5 アーカイブ (`ArchiveService.js`)

| 対象 | 移動 |
|------|------|
| 本予約 + 部屋割 | 03+04 → 07+08 |
| リクエスト | 02 → 06 |

**条件:** `checkout < today`

メニュー: 古い予約/リクエストをアーカイブ  
日次トリガー: 03:00

---

## 5.6 トリガー (`TriggerSetup.js`)

| ハンドラ | 間隔 | 処理 |
|----------|------|------|
| `scheduledStudioImport_` | 5分 | `importAllPendingReservations_` |
| `scheduledArchiveDaily_` | 毎日3:00 | アーカイブ |
| `onSpreadsheetOpenStudioImport_` | スプシopen | 取込（STUDIOは15秒スロットル） |
| GCal同期 | 5分（別登録） | `syncGCalByTrigger` |

---

## 5.7 Googleカレンダー (`GCalSync.js`)

- 対象: アクティブ予約（仮予約・確定）、チェックアウトが過去30日より後
- カレンダーID: `Config.googleCalendarId`（施設共有カレンダー）
- 台帳の `GCalイベントID` 列で追跡
- メニュー: 連携 / 連携解除（全イベント削除+トリガー停止）

---

## 5.8 過去データ取込

- `13_過去予約取込` → 直接 `07_アーカイブ`
- `14_過去同行者取込` → `05_同行者情報`
- ID: `PAST-YYYY-NNN`

---

## 5.9 手動・メニュー操作

| メニュー | 処理 |
|----------|------|
| シートを初期化 | 全データ消去+構造再作成（既存データあり则警告中止） |
| シート構成を整備（データ保持） | 列追加・修復 |
| 予約データを取り込む | リクエスト→STUDIO→リリンク |
| 顧客索引を同期 | 未登録分のみ |
| 顧客索引を全件再構築 | 全消去再構築 ⚠ |
