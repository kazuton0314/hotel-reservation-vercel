# あなたがやること（約15分）

コード側の準備は済んでいます。次の **4 ステップだけ** お願いします。

---

## Step 1: Google Cloud でサービスアカウント作成

1. https://console.cloud.google.com/
2. プロジェクト選択（なければ新規。例: `tokeidai-reservation`）
3. **API とサービス → ライブラリ** →「Google Sheets API」→ **有効にする**
4. **API とサービス → 認証情報 → 認証情報を作成 → サービスアカウント**
   - 名前: `reservation-sync`（任意）
5. 作成したアカウント → **キー** → **鍵を追加 → JSON** → ダウンロード

---

## Step 2: `.env.local` に追記

JSON ファイルを開き、次の2つをコピー:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=（client_email の値）
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="（private_key の値。ダブルクォートで囲む）"
```

すでに設定済みの例:

```env
GOOGLE_BOOKING_FORM_SPREADSHEET_ID=1AkN0BOrB1PAhiy0rGTLbY7CDtf8toYJhD3OFVPvhw4M
GOOGLE_REQUEST_FORM_SPREADSHEET_ID=1rG6bYt3LnbHuu3Ck4kCdqjx7DHWYGwr2aHHgIR_Jo6Q
```

---

## Step 3: テストスプシ 2 つに共有

**Step 2 の `GOOGLE_SERVICE_ACCOUNT_EMAIL` のアドレス** を、次の2つのスプシに **閲覧者** で追加:

| 用途 | 開き方 |
|------|--------|
| 本予約テスト | https://docs.google.com/spreadsheets/d/1AkN0BOrB1PAhiy0rGTLbY7CDtf8toYJhD3OFVPvhw4M/edit |
| リクエストテスト | https://docs.google.com/spreadsheets/d/1rG6bYt3LnbHuu3Ck4kCdqjx7DHWYGwr2aHHgIR_Jo6Q/edit |

※ tomaro-sent でも tomaro@ でもなく、**サービスアカウントのメール**です。

---

## Step 4: テストデータを貼る（任意だが推奨）

`data/test-forms/README.md` 参照:

- 各スプシの1行目にヘッダー行
- 2行目にサンプル1行

---

## 確認（あなた or 私がログを見る）

```powershell
npm run check:setup
```

すべて ✓ なら:

```powershell
npm run sync:forms
```

ブラウザ: http://localhost:3000/settings/setup

---

## やらなくていいこと

- tomaro-sent の設定
- 本番フォームの切り替え
- 予約管理DB スプシの共有
- Vercel デプロイ（取込成功後でOK）
