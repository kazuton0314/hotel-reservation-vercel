# 01. システム概要

## アーキテクチャ

```
[Googleフォーム リクエスト] ──IMPORTRANGE──► 00_予約リクエスト取込 ──GAS──► 02_予約リクエスト台帳
[Googleフォーム STUDIO本予約] ──IMPORTRANGE──► 01_本予約取込 ──GAS──► 03_予約台帳
                                                      │
[スタッフ Webアプリ] ◄──api*──► GAS (ReservationService, RequestImport, …)
[ゲスト 同行者フォーム] ◄──companionForm*──► CompanionService
                                                      │
                                              04_部屋割り / 05_同行者情報
                                              09_顧客索引 / 12_メールテンプレート
                                                      │
                                              Googleカレンダー (GCalSync)
```

| 層 | 技術 | 役割 |
|----|------|------|
| DB | スプレッドシート `みどりの時計台_予約管理DB` | 15シート（00〜14） |
| バックエンド | Google Apps Script (clasp) | 取込・CRUD・メール・同期 |
| スタッフUI | HtmlService (`Index.html` + `Client*.html`) | スマホ運用 |
| ゲストUI | `CompanionForm.html` | 同行者情報 |

- タイムゾーン: `Asia/Tokyo`
- GASデプロイ: `executeAs: USER_DEPLOYING`, `access: ANYONE`（`appsscript.json`）

---

## Webアプリ URL

| 種別 | パターン | アクセス |
|------|----------|----------|
| 本番スタッフ | `/exec?s={token}` | 共有URL（ScriptProperties のトークン） |
| テスト/dev | `/dev` | `/dev` URLを知っている人（トークン不要） |
| 同行者フォーム | `?page=companion&key={外部受付キー}` | 公開（キー必須） |
| 無効 | `/exec` トークンなし等 | 案内ページのみ |

設定: `Config.js` の `webAppUrl`, `webAppTestDevUrl`, `staffWebApp`

### doGet 分岐 (`Code.js`)

1. `page=companion` → `CompanionForm.html`（`accessKey` をテンプレート注入）
2. `canOpenStaffWebApp_(params)` → `Index.html` + `staffSessionId` 注入
3. それ以外 → `renderPublicWebAppLanding_()`（ゲスト向け案内）

---

## スタッフ認証 (`AuthService.js`)

- **Googleログインは使わない。** URL秘匿 + サーバー側セッション。
- ページ読み込み時: `createStaffWebSession_()` → 32桁hexを `window.__STAFF_SID__` に注入
- 全 `api*` 呼び出し: 第1引数に `staffSessionId` を付与（`ClientCore.run` が自動付与）
- 検証: `CacheService` に `STAFF_SESS_{id}` → TTL **12時間**
- **スライディング延長:** 各API成功時にTTLをリセット
- 失効時: `権限がありません` → UIは「ページを再読み込みしてください」

---

## クライアントファイル構成 (`Index.html` 読込順)

| ファイル | 役割 |
|----------|------|
| `Style.html` | CSS |
| `GuestDisplay.html` | 人数表示フォーマット（`GuestDisplay` グローバル） |
| `ClientReservationSync.html` | 部屋割変更後の詳細/一覧キャッシュ同期 |
| `ClientOccBoard.html` | 部屋割ボードのD&D・編集モードUIロック |
| `ClientCore.html` | 状態管理・ナビ・共通UI・ホーム・API `run()` |
| `ClientRooms.html` | 部屋割月間ボード |
| `ClientCalendar.html` | 予定カレンダー（月/週/日） |
| `ClientList.html` | 本予約一覧 |
| `ClientDetail.html` | 本予約詳細 |
| `ClientRequest.html` | リクエスト一覧・詳細 |
| `ClientCustomers.html` | 顧客索引検索 |
| `ClientMail.html` | メール定型文・送信モーダル |

`legacy/` は `.claspignore` でデプロイ対象外。

---

## グローバルUI

### ヘッダー

- `←` 戻る（サブ画面時）
- タイトル（`#page-title`、dev時は「予約管理（開発）」）
- `↻` 更新（`refresh()` → bootstrap再取得）

### 下部ナビ（6タブ）

| data-view | ラベル | ページタイトル |
|-----------|--------|----------------|
| dashboard | ホーム | 予約管理 |
| rooms | 部屋割 | 部屋割りボード |
| calendar | 予定 | 予定カレンダー |
| request | リクエスト | リクエスト |
| list | 本予約 | 本予約 |
| customers | 顧客 | 顧客索引 |

サブ画面（`state.subView`）中はナビ非表示。`exitSubView()` で復帰。

### 状態 (`ClientCore` の `state`)

主要フィールド:

- `view`, `subView`, `detailId`, `returnView`, `returnSubView`
- `reservationList`, `listFilter`, `listScope`, `listSort`, `reservationSearchCriteria`
- `requestListAll`, `requestFilter`, `requestScope`, `requestSort`, `requestSearchCriteria`
- `roomsYear`, `roomsMonth`, `occEditMode`, `occEditBase`
- `cache`: month, week, day, roomMonth, detail 等
- `bootstrap`: dashboard, rooms, masters

### API呼び出し

```javascript
run('apiGetReservationList', period, '', scope, true) // 末尾 true = サイレント（ローディング非表示）
```

`api` で始まる関数には自動で `__STAFF_SID__` を先頭に付与。

---

## 開発・デプロイ

```bash
clasp push          # コード反映（/dev に即時）
# 本番: デプロイ管理で新バージョン（/exec URLは不変）
```

メニュー（スプレッドシート）: **予約管理** — 初期化、取込、アーカイブ、顧客索引、GCal、WebアプリURL表示など（`Code.js` `buildReservationMenu_`）。
