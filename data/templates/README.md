# 過去データ CSV テンプレート

このフォルダの CSV は **ヘッダー行のみ**です。データを追記してから取込んでください。

## 取込コマンド

```powershell
npm run import:csv -- reservations-archive ./data/templates/past-reservations.csv
npm run import:csv -- room-assignments-archive ./data/templates/past-room-assignments.csv
npm run import:csv -- companions ./data/templates/past-companions.csv
```

順序: **本予約 → 部屋割 → 同行者**（部屋割・同行者は予約IDが先に必要）

## 本予約（past-reservations.csv）の必須ルール

| 列 | 値 |
|---|---|
| 予約ID | `PAST-2024-001` 形式（既存と重複しない番号） |
| 取込元 | 必ず `過去取込` |
| 取込行ID | `past:1` など、または空。**素の数字は禁止** |
| 予約経路 | 例: `過去データ` |

`STUDIO-MT*` / `MANUAL-MT*` は使わないでください（現行フォーム採番と衝突します）。

## 部屋割（past-room-assignments.csv）

| 列 | 例 |
|---|---|
| 部屋割りID | `RA-2024-0001` |
| 予約ID | 上の `PAST-…` と一致 |
| 部屋ID | `R01` など |
| 利用開始日 / 利用終了日 | `YYYY-MM-DD` |

## 同行者（past-companions.csv）

| 列 | 例 |
|---|---|
| 予約ID | `PAST-…` |
| No | 同一予約内の連番 |
| 氏名 | 必須 |
