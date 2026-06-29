# テストフォーム用スプレッドシート — 貼り付け手順

## 本予約テスト（`GOOGLE_BOOKING_FORM_SPREADSHEET_ID`）

1. スプレッドシートを開く
2. **シート1** の **A1** を選択
3. `booking-header-row.txt` の2行目（タブ区切りの列名）をコピーして貼り付け
4. **A2** に `booking-sample-row.txt` の2行目を貼り付け
5. サービスアカウントを **閲覧者** で共有

## リクエストテスト（`GOOGLE_REQUEST_FORM_SPREADSHEET_ID`）

1. 同様に `request-header-row.txt` → 1行目
2. `request-sample-row.txt` → 2行目

## 確認

```powershell
npm run check:setup
npm run sync:forms
```

## 注意

- 1行目は必ずヘッダー（列名）
- シート名は `シート1`（変える場合は `.env.local` の `GOOGLE_*_SHEET_NAME`）
