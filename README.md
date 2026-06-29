# みどりの時計台 予約管理（Supabase + Vercel + Next.js）

宿泊施設「みどりの時計台」の予約管理を、既存 GAS システム（`hotel-reservation-gas`）とは独立して新規構築するプロジェクトです。

## 方針

| 項目 | 内容 |
|------|------|
| 既存 GAS / 予約管理DB | **変更しない**（並行運用） |
| 継続的なデータ入力 | STUDIO 本予約フォーム・予約リクエストフォームの**回答スプシのみ** |
| 予約管理DB（15シート） | DB 設計の参考 + **初期 CSV インポートのみ** |

## 技術スタック

- Next.js 16（App Router）
- Supabase（PostgreSQL）
- Vercel（Preview / Production + Cron）
- Google Sheets API（フォーム回答の読み取り専用）

## セットアップ

詳細は **[docs/SETUP-YOUR-TASKS.md](docs/SETUP-YOUR-TASKS.md)**（あなたがやる4ステップ）を参照。

```powershell
npm install
cp .env.example .env.local
# .env.local を編集後:
npm run check:setup   # 環境変数・接続の自動診断
npm run dev
```

ブラウザ: http://localhost:3000/settings/setup （設定状況の確認画面）

## スクリプト

| コマンド | 用途 |
|----------|------|
| `npm run dev` | ローカル開発 |
| `npm run import:csv -- <target> <file>` | 予約管理DB からの初期 CSV 投入 |
| `npm run sync:forms` | フォーム回答スプシから手動取込 |

## Phase 1 の範囲

- [x] Supabase スキーマ（予約・リクエスト・部屋割り・取込ログ）
- [x] CSV 初期インポート
- [x] フォーム 2 本からの取込（5 分 Cron）
- [x] 本予約一覧・詳細（読み取り専用）
- [ ] リクエスト一覧 UI（Phase 2）
- [ ] 部屋割ボード（Phase 3）
- [ ] 書き込み・メール・GCal（Phase 4+）

詳細は [docs/SYNC.md](docs/SYNC.md) を参照してください。

## 参考リポジトリ

- `hotel-reservation-gas` … 既存本番（触らない）
- `facility-task-manager` … Supabase + Next.js の構成参考
