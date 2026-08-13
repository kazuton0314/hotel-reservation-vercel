import { DEFAULTS } from "@/lib/config/forms";
import {
  buildAddress,
  buildCheckInDate,
  buildCheckOutDate,
  calculateNights,
  formatDateIso,
  isCheckInWithinBookingHorizon,
  joinName,
  parseDateValue,
} from "@/lib/import/date-utils";
import { businessToday } from "@/lib/utils/date-label";
import {
  asPhoneString,
  asTextField,
  generateAccessKey,
  getCell,
  headerIndex,
  isTruthyFlag,
} from "@/lib/import/parsers";
import type { SheetRow } from "@/lib/sheets/client";
import {
  normalizeGuestBreakdownForStorage,
  normalizeGuestTotalForStorage,
} from "@/lib/utils/guest-count-format";

export type ReservationInsert = {
  reservation_id: string;
  access_key: string | null;
  import_source: string | null;
  import_row_id: string | null;
  request_id: string | null;
  channel: string | null;
  status: string;
  last_name: string | null;
  first_name: string | null;
  representative_name: string | null;
  last_name_kana: string | null;
  first_name_kana: string | null;
  name_kana: string | null;
  group_type: string | null;
  group_name: string | null;
  email: string | null;
  phone: string | null;
  phone_available: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line: string | null;
  address: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
  arrival_time: string | null;
  transport: string | null;
  vehicle_count: string | null;
  meal: string | null;
  bbq: string | null;
  somen: string | null;
  inquiry: string | null;
  travel_purpose: string | null;
  travel_purpose_other: string | null;
  referral: string | null;
  referral_other: string | null;
  last_stay: string | null;
  assignment_status: string | null;
  companion_form_answered: boolean;
  completion_email_sent: boolean;
  completion_email_sent_at: string | null;
  day11_email_sent: boolean;
  day11_email_sent_at: string | null;
  day3_email_sent: boolean;
  day3_email_sent_at: string | null;
  payment_method: string | null;
  payment_status: string | null;
  customer_id: string | null;
  internal_memo: string | null;
  guest_memo: string | null;
  gcal_event_id: string | null;
  is_archived: boolean;
  sheet_created_at: string | null;
  sheet_updated_at: string | null;
  synced_at: string;
};

function g(
  values: unknown[],
  index: Record<string, number>,
  key: string,
  ...aliases: string[]
): unknown {
  for (const k of [key, ...aliases]) {
    const v = getCell(values, index, k);
    if (v !== "" && v != null) return v;
  }
  // キー自体が存在するなら空文字でも返す（未入力）
  if (index[key] !== undefined) return getCell(values, index, key);
  for (const k of aliases) {
    if (index[k] !== undefined) return getCell(values, index, k);
  }
  return "";
}

const SOMEN_HEADER_KEYS = [
  "流しそうめんレンタル",
  "流しそうめんのレンタル",
  "流しそうめん",
] as const;

export function normalizeSomenValue(value: unknown): string | null {
  const s = asTextField(value);
  if (!s) return null;
  if (s === "要" || s === "必要") return "要";
  if (s === "不要" || s === "不必要" || s === "なし") return "不要";
  return s;
}

/** STUDIO 回答行から流しそうめんレンタルを読む（ヘッダー名の揺れ・部分一致も拾う） */
export function readStudioSomen(
  headers: string[],
  values: unknown[]
): string | null {
  const idx = headerIndex(headers);
  const exact = normalizeSomenValue(g(values, idx, ...SOMEN_HEADER_KEYS));
  if (exact) return exact;
  const fuzzy = headers.findIndex((h) => String(h ?? "").includes("そうめん"));
  if (fuzzy >= 0) return normalizeSomenValue(values[fuzzy]);
  return null;
}

function toIsoDate(value: unknown): string | null {
  const d = parseDateValue(value);
  return d ? formatDateIso(d) : null;
}

function toTimestamp(value: unknown): string | null {
  if (value === "" || value == null) return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** 03_予約台帳 CSV 行 → reservations */
export function mapLedgerCsvRow(
  record: Record<string, unknown>,
  isArchived: boolean
): ReservationInsert | null {
  const reservationId = String(record["予約ID"] ?? "").trim();
  if (!reservationId) return null;

  const checkIn = toIsoDate(record["チェックイン日"]);
  const checkOut = toIsoDate(record["チェックアウト日"]);

  return {
    reservation_id: reservationId,
    access_key: asTextField(record["外部受付キー"]) || null,
    import_source: asTextField(record["取込元"]) || null,
    import_row_id: asTextField(record["取込行ID"]) || null,
    request_id: asTextField(record["リクエストID"]) || null,
    channel: asTextField(record["予約経路"]) || null,
    status: asTextField(record["ステータス"]) || DEFAULTS.status,
    last_name: asTextField(record["姓"]) || null,
    first_name: asTextField(record["名"]) || null,
    representative_name: asTextField(record["代表者名"]) || null,
    last_name_kana: asTextField(record["姓ふりがな"]) || null,
    first_name_kana: asTextField(record["名ふりがな"]) || null,
    name_kana: asTextField(record["ふりがな"]) || null,
    group_type: asTextField(record["グループ形態"]) || null,
    group_name: asTextField(record["グループ名"]) || null,
    email: asTextField(record["メールアドレス"]).toLowerCase() || null,
    phone: asPhoneString(record["電話番号"]) || null,
    phone_available: asTextField(record["電話可能時間"]) || null,
    postal_code: asTextField(record["郵便番号"]) || null,
    prefecture: asTextField(record["都道府県"]) || null,
    city: asTextField(record["市区町村"]) || null,
    address_line: asTextField(record["建物名・番地"]) || null,
    address: asTextField(record["住所"]) || null,
    check_in: checkIn,
    check_out: checkOut,
    nights: Number(record["泊数"]) || null,
    guest_total: normalizeGuestTotalForStorage(asTextField(record["宿泊人数"])),
    adult_male: normalizeGuestBreakdownForStorage(asTextField(record["中学生以上男性"])),
    adult_female: normalizeGuestBreakdownForStorage(asTextField(record["中学生以上女性"])),
    boy_student: normalizeGuestBreakdownForStorage(asTextField(record["小学生男の子"])),
    girl_student: normalizeGuestBreakdownForStorage(asTextField(record["小学生女の子"])),
    age_3plus: normalizeGuestBreakdownForStorage(asTextField(record["3歳以上幼児"])),
    under_3: normalizeGuestBreakdownForStorage(asTextField(record["3歳未満乳幼児"])),
    arrival_time: asTextField(record["到着時間"]) || null,
    transport: asTextField(record["交通手段"]) || null,
    vehicle_count: asTextField(record["車両台数"]) || null,
    meal: asTextField(record["食事"]) || null,
    bbq: asTextField(record["BBQレンタル"]) || null,
    somen:
      normalizeSomenValue(record["流しそうめんレンタル"]) ||
      normalizeSomenValue(record["流しそうめんのレンタル"]) ||
      null,
    inquiry: asTextField(record["お問い合わせ内容"]) || null,
    travel_purpose: asTextField(record["旅行の目的"]) || null,
    travel_purpose_other: asTextField(record["旅行の目的_その他"]) || null,
    referral: asTextField(record["きっかけ"]) || null,
    referral_other: asTextField(record["きっかけ_その他"]) || null,
    last_stay: asTextField(record["前回宿泊時期"]) || null,
    assignment_status:
      asTextField(record["割当状況"]) || DEFAULTS.assignmentStatus,
    companion_form_answered: isTruthyFlag(record["同行者情報回答済"]),
    completion_email_sent: isTruthyFlag(record["予約完了メール送付済"]),
    completion_email_sent_at: toTimestamp(record["予約完了メール送付日時"]),
    day11_email_sent: isTruthyFlag(record["11日前メール送付済"]),
    day11_email_sent_at: toTimestamp(record["11日前メール送付日時"]),
    day3_email_sent: isTruthyFlag(record["3日前メール送付済"]),
    day3_email_sent_at: toTimestamp(record["3日前メール送付日時"]),
    payment_method: asTextField(record["支払方法"]) || null,
    payment_status: asTextField(record["支払状況"]) || null,
    customer_id: asTextField(record["顧客ID"]) || null,
    internal_memo:
      asTextField(record["運用メモ"]) ||
      asTextField(record["内部メモ"]) ||
      null,
    guest_memo: asTextField(record["宿泊者メモ"]) || null,
    gcal_event_id: asTextField(record["GCalイベントID"]) || null,
    is_archived: isArchived,
    sheet_created_at: toTimestamp(record["作成日時"]),
    sheet_updated_at: toTimestamp(record["更新日時"]),
    synced_at: new Date().toISOString(),
  };
}

/** STUDIO フォーム行 → reservations（StudioImport.buildReservationFromStudioRow 相当） */
export function mapStudioFormRow(
  row: SheetRow,
  headers: string[],
  reservationId: string,
  now: Date,
  options: { validateBookingHorizon?: boolean } = {}
): ReservationInsert {
  const idx = headerIndex(headers);
  const v = row.values;
  const nowIso = now.toISOString();

  const lastName = String(g(v, idx, "姓") ?? "").trim();
  const firstName = String(g(v, idx, "名") ?? "").trim();
  const lastNameKana = String(g(v, idx, "姓ふりがな") ?? "").trim();
  const firstNameKana = String(g(v, idx, "名ふりがな") ?? "").trim();
  const email = String(g(v, idx, "メールアドレス") ?? "")
    .trim()
    .toLowerCase();

  const checkIn = buildCheckInDate(
    g(v, idx, "チェックイン年"),
    g(v, idx, "チェックイン月"),
    g(v, idx, "チェックイン日"),
    businessToday()
  );
  const checkOut = checkIn
    ? buildCheckOutDate(
        checkIn,
        g(v, idx, "チェックアウト年"),
        g(v, idx, "チェックアウト月"),
        g(v, idx, "チェックアウト日")
      )
    : null;

  if (!checkIn || !checkOut) {
    throw new Error(`チェックイン/チェックアウト日を組み立てできません（行${row.sheetRow}）`);
  }
  if (
    options.validateBookingHorizon !== false &&
    !isCheckInWithinBookingHorizon(checkIn, businessToday())
  ) {
    throw new Error(
      `チェックインが受付可能範囲外（1年以上先または過去日・行${row.sheetRow}）`
    );
  }

  const postal = asTextField(g(v, idx, "郵便番号"));
  const pref = asTextField(g(v, idx, "都道府県"));
  const city = asTextField(g(v, idx, "市区町村"));
  const line = asTextField(g(v, idx, "建物名・番地"));

  return {
    reservation_id: reservationId,
    access_key: generateAccessKey(),
    import_source: DEFAULTS.importSourceStudio,
    import_row_id: String(row.sheetRow),
    request_id: null,
    channel: DEFAULTS.channel,
    status: DEFAULTS.status,
    last_name: lastName || null,
    first_name: firstName || null,
    representative_name: joinName(lastName, firstName) || null,
    last_name_kana: lastNameKana || null,
    first_name_kana: firstNameKana || null,
    name_kana: joinName(lastNameKana, firstNameKana) || null,
    group_type: asTextField(g(v, idx, "グループ形態")) || null,
    group_name: asTextField(g(v, idx, "グループ名")) || null,
    email: email || null,
    phone: asPhoneString(g(v, idx, "電話番号")) || null,
    phone_available: asTextField(g(v, idx, "電話可能時間")) || null,
    postal_code: postal || null,
    prefecture: pref || null,
    city: city || null,
    address_line: line || null,
    address: buildAddress(postal, pref, city, line) || null,
    check_in: formatDateIso(checkIn),
    check_out: formatDateIso(checkOut),
    nights: calculateNights(checkIn, checkOut),
    guest_total: normalizeGuestTotalForStorage(asTextField(g(v, idx, "人数"))),
    adult_male: normalizeGuestBreakdownForStorage(
      asTextField(
        g(v, idx, "中学生以上の男性（大人）", "大人男", "中学生以上男性")
      )
    ),
    adult_female: normalizeGuestBreakdownForStorage(
      asTextField(
        g(v, idx, "中学生以上の女性（大人）", "大人女", "中学生以上女性")
      )
    ),
    boy_student: normalizeGuestBreakdownForStorage(
      asTextField(g(v, idx, "小学生の男の子", "小学生男", "小学生男の子"))
    ),
    girl_student: normalizeGuestBreakdownForStorage(
      asTextField(g(v, idx, "小学生の女の子", "小学生女", "小学生女の子"))
    ),
    age_3plus: normalizeGuestBreakdownForStorage(
      asTextField(g(v, idx, "3歳以上のお子さま", "3歳以上", "3歳以上幼児"))
    ),
    under_3: normalizeGuestBreakdownForStorage(
      asTextField(g(v, idx, "3歳未満のお子さま", "3歳未満", "3歳未満乳幼児"))
    ),
    arrival_time: asTextField(g(v, idx, "到着時間")) || null,
    transport: asTextField(g(v, idx, "交通手段")) || null,
    vehicle_count: asTextField(g(v, idx, "車両台数")) || null,
    meal: asTextField(g(v, idx, "食事")) || null,
    bbq: asTextField(g(v, idx, "BBQレンタル")) || null,
    somen: readStudioSomen(headers, v),
    inquiry: asTextField(g(v, idx, "お問い合わせ内容")) || null,
    travel_purpose: asTextField(g(v, idx, "旅行の目的")) || null,
    travel_purpose_other: asTextField(g(v, idx, "旅行の目的-その他")) || null,
    referral: asTextField(g(v, idx, "きっかけ")) || null,
    referral_other: asTextField(g(v, idx, "きっかけ-その他")) || null,
    last_stay: asTextField(g(v, idx, "前回宿泊時期")) || null,
    assignment_status: DEFAULTS.assignmentStatus,
    companion_form_answered: false,
    completion_email_sent: false,
    completion_email_sent_at: null,
    day11_email_sent: false,
    day11_email_sent_at: null,
    day3_email_sent: false,
    day3_email_sent_at: null,
    payment_method: null,
    payment_status: DEFAULTS.paymentStatus,
    customer_id: null,
    internal_memo: null,
    guest_memo: null,
    gcal_event_id: null,
    is_archived: false,
    sheet_created_at: nowIso,
    sheet_updated_at: nowIso,
    synced_at: nowIso,
  };
}

export function isStudioRowImportable(
  row: SheetRow,
  headers: string[]
): boolean {
  const idx = headerIndex(headers);
  const v = row.values;
  const lastName = String(g(v, idx, "姓") ?? "").trim();
  const email = String(g(v, idx, "メールアドレス") ?? "").trim();
  return Boolean(lastName || email);
}
