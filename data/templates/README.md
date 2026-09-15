# 過去データ CSV テンプレート

このフォルダの CSV は **ヘッダー行のみ**です。データを追記してから取込んでください。

## 推奨: 紙台帳転記用（シンプル）

紙の台帳から 2006〜2025 年分を追加入力する場合は、こちらを使います。

| ファイル | 用途 |
|---|---|
| `past-ledger-reservations.csv` | 本予約（部屋名は1セルにカンマ区切り） |
| `past-ledger-companions.csv` | 同行者（任意・別シート） |

### 取込コマンド

```powershell
# まず dry-run で確認
npm run import:past-ledger -- --dry-run --batch 2006-v1 ./data/my-2006.csv

# 同行者もある場合（取込キーで紐付け）
npm run import:past-ledger -- --batch 2006-v1 --companions ./data/my-2006-companions.csv ./data/my-2006.csv

# 本番投入
npm run import:past-ledger -- --batch 2006-v1 ./data/my-2006.csv
```

投入後: `npm run rebuild:customers`（顧客索引の更新）

### 取込キー（人が付ける番号）

本予約 CSV の **取込キー** は、転記時に人が付ける識別子です（例: `2006-001`, `2024-015`）。

- 同行者 CSV も **同じ取込キー** を書けば、自動で予約に紐付きます
- 予約ID（`PAST-2006-001` など）は **自動採番** されるので、CSV には書きません
- 既存の PAST データは変更しません（追加分のみ insert）

### 本予約 CSV のルール

| 列 | ルール |
|---|---|
| 取込キー | 必須。CSV 内で重複不可。例: `2006-001` |
| チェックイン日 / チェックアウト日 | 必須。`YYYY-MM-DD` または `YYYY/MM/DD` |
| 代表者名 | 必須 |
| 部屋 | 任意。部屋名をカンマ区切り。例: `理科室,高学年室` |
| その他 | 紙台帳にある項目だけ埋めれば OK |

部屋名はマスタと一致させてください: 理科室 / 低学年室 / 高学年室 / 保健室 / 音楽室 / 図書室

### 同行者 CSV のルール

| 列 | ルール |
|---|---|
| 取込キー | 本予約 CSV と同じ値 |
| No | 同一予約内の連番 |
| 氏名 | 必須 |

### 自動で付与される値

- 予約ID: `PAST-{チェックイン年}-{連番}`（その年の既存最大値 + 1）
- 部屋割りID: `RA-{年}-{連番}`
- 取込元: `過去取込`
- 取込行ID: `past:ledger-{batch}-{行番号}`
- ステータス: `確定` / アーカイブ: `true`

### 重複チェック

チェックイン日 + 代表者名 + 電話番号 が、既存の「過去取込」データと一致する行は **スキップ** します。

---

## 従来テンプレート（フル列・上級者向け）

既存の 59 列テンプレート。予約ID を自分で付ける必要があります。

```powershell
npm run import:csv -- reservations-archive ./data/templates/past-reservations.csv
npm run import:csv -- room-assignments-archive ./data/templates/past-room-assignments.csv
npm run import:csv -- companions ./data/templates/past-companions.csv
```

順序: **本予約 → 部屋割 → 同行者**（部屋割・同行者は予約IDが先に必要）

### 本予約（past-reservations.csv）の必須ルール

| 列 | 値 |
|---|---|
| 予約ID | `PAST-2024-001` 形式（既存と重複しない番号） |
| 取込元 | 必ず `過去取込` |
| 取込行ID | `past:1` など、または空。**素の数字は禁止** |
| 予約経路 | 例: `過去データ` |

`STUDIO-MT*` / `MANUAL-MT*` は使わないでください（現行フォーム採番と衝突します）。

### 部屋割（past-room-assignments.csv）

| 列 | 例 |
|---|---|
| 部屋割りID | `RA-2024-0001` |
| 予約ID | 上の `PAST-…` と一致 |
| 部屋ID | `R01` など |
| 利用開始日 / 利用終了日 | `YYYY-MM-DD` |

### 同行者（past-companions.csv）

| 列 | 例 |
|---|---|
| 予約ID | `PAST-…` |
| No | 同一予約内の連番 |
| 氏名 | 必須 |
