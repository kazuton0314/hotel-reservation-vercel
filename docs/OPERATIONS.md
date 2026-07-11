# 運用コマンド一覧

現場運用で使う `npm run` をこのファイルに集約します。

## セットアップ・同期

- `npm run check:setup`  
  環境変数/接続状態を検証
- `npm run sync:forms`  
  本予約フォーム・リクエストフォームを同期（事後リンク付き）

## CSV 取込

- `npm run import:csv -- reservations-active <path>`
- `npm run import:csv -- reservations-archive <path>`
- `npm run import:csv -- requests-active <path>`
- `npm run import:csv -- requests-archive <path>`
- `npm run import:csv -- room-assignments-active <path>`
- `npm run import:csv -- room-assignments-archive <path>`
- `npm run import:csv -- companions <path>`

## データ整備

- `npm run link:records`  
  リクエスト↔本予約の事後リンク
- `npm run rebuild:customers`  
  顧客索引を再構築

## 補足

- これら script 実行履歴は `import_job_runs`（migration `009`）に記録されます。
- 画面からは `/settings/operations` で確認できます。
