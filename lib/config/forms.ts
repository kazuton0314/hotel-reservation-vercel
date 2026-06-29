/**
 * フォーム回答スプレッドシートの設定
 * 本予約フォーム・リクエストフォーム（いずれも STUDIO 製）の回答先スプシ ID
 */

export function getFormSources() {
  return {
    /** 本予約フォーム（GAS では STUDIO 本予約取込） */
    booking: {
      spreadsheetId:
        process.env.GOOGLE_BOOKING_FORM_SPREADSHEET_ID ??
        process.env.GOOGLE_STUDIO_SPREADSHEET_ID ??
        "11DhFnVRKTkeVFs5FAj78gL-2M5iEae8CKodxOUhMKAY",
      sheetName:
        process.env.GOOGLE_BOOKING_FORM_SHEET_NAME ??
        process.env.GOOGLE_STUDIO_SHEET_NAME ??
        "シート1",
      dataColumnCount: 38,
    },
    /** 予約リクエストフォーム */
    request: {
      spreadsheetId:
        process.env.GOOGLE_REQUEST_FORM_SPREADSHEET_ID ??
        process.env.GOOGLE_REQUEST_SPREADSHEET_ID ??
        "1hKa89ds_DZbpxDxI9w0fU9R-UNjUGhnqyXKXLmsekuc",
      sheetName:
        process.env.GOOGLE_REQUEST_FORM_SHEET_NAME ??
        process.env.GOOGLE_REQUEST_SHEET_NAME ??
        "シート1",
      dataColumnCount: 15,
    },
  } as const;
}

/** 互換エクスポート（遅延評価） */
export const FORM_SOURCES = {
  get booking() {
    return getFormSources().booking;
  },
  get request() {
    return getFormSources().request;
  },
} as const;

/** @deprecated FORM_SOURCES.booking を使用 */
export const FORM_SOURCES_LEGACY_STUDIO = FORM_SOURCES.booking;

export const DEFAULTS = {
  channel: "自社サイト",
  status: "確定",
  assignmentStatus: "未割当",
  paymentStatus: "未払い",
  importSourceStudio: "STUDIO",
  requestStatus: "リクエスト",
} as const;

/** 03_予約台帳 CSV ヘッダー（Config.ledgerHeaders） */
export const LEDGER_HEADERS = [
  "予約ID",
  "外部受付キー",
  "取込元",
  "取込行ID",
  "リクエストID",
  "予約経路",
  "ステータス",
  "姓",
  "名",
  "代表者名",
  "姓ふりがな",
  "名ふりがな",
  "ふりがな",
  "グループ形態",
  "グループ名",
  "メールアドレス",
  "電話番号",
  "電話可能時間",
  "郵便番号",
  "都道府県",
  "市区町村",
  "建物名・番地",
  "住所",
  "チェックイン日",
  "チェックアウト日",
  "泊数",
  "宿泊人数",
  "中学生以上男性",
  "中学生以上女性",
  "小学生男の子",
  "小学生女の子",
  "3歳以上幼児",
  "3歳未満乳幼児",
  "到着時間",
  "交通手段",
  "車両台数",
  "食事",
  "BBQレンタル",
  "お問い合わせ内容",
  "旅行の目的",
  "旅行の目的_その他",
  "きっかけ",
  "きっかけ_その他",
  "前回宿泊時期",
  "割当状況",
  "同行者情報回答済",
  "予約完了メール送付済",
  "予約完了メール送付日時",
  "11日前メール送付済",
  "11日前メール送付日時",
  "3日前メール送付済",
  "3日前メール送付日時",
  "支払方法",
  "支払状況",
  "顧客ID",
  "内部メモ",
  "作成日時",
  "更新日時",
  "GCalイベントID",
] as const;

/** STUDIO フォーム 38 列（Config.studioImportDataHeaders） */
export const STUDIO_FORM_HEADERS = [
  "姓",
  "名",
  "姓ふりがな",
  "名ふりがな",
  "グループ形態",
  "グループ名",
  "メールアドレス",
  "電話番号",
  "電話可能時間",
  "郵便番号",
  "都道府県",
  "市区町村",
  "建物名・番地",
  "チェックイン年",
  "チェックイン月",
  "チェックイン日",
  "チェックアウト年",
  "チェックアウト月",
  "チェックアウト日",
  "人数",
  "中学生以上の男性（大人）",
  "小学生の男の子",
  "3歳以上のお子さま",
  "中学生以上の女性（大人）",
  "小学生の女の子",
  "3歳未満のお子さま",
  "到着時間",
  "交通手段",
  "車両台数",
  "食事",
  "BBQレンタル",
  "お問い合わせ内容",
  "旅行の目的",
  "旅行の目的-その他",
  "きっかけ",
  "きっかけ-その他",
  "前回宿泊時期",
  "プライバシーポリシー",
] as const;

/** リクエストフォーム 15 列 */
export const REQUEST_FORM_HEADERS = [
  "姓",
  "名",
  "姓ふりがな",
  "名ふりがな",
  "グループ形態",
  "メールアドレス",
  "電話番号",
  "電話可能時間",
  "チェックイン月",
  "チェックイン日",
  "チェックアウト月",
  "チェックアウト日",
  "人数",
  "お問い合わせ内容",
  "プライバシーポリシー",
] as const;
