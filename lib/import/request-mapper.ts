import { DEFAULTS } from "@/lib/config/forms";
import {
  buildCheckInDate,
  buildCheckOutDate,
  calculateNights,
  formatDateIso,
  isCheckInWithinBookingHorizon,
  joinName,
  parseDateValue,
  stripTime,
} from "@/lib/import/date-utils";
import { businessToday } from "@/lib/utils/date-label";
import {
  asPhoneString,
  asTextField,
  generateAccessKey,
  getCell,
  headerIndex,
} from "@/lib/import/parsers";
import type { SheetRow } from "@/lib/sheets/client";
import { normalizeGuestTotalForStorage } from "@/lib/utils/guest-count-format";

export type RequestInsert = {
  request_id: string;
  access_key: string;
  import_row_id: string;
  status: string;
  last_name: string | null;
  first_name: string | null;
  representative_name: string | null;
  last_name_kana: string | null;
  first_name_kana: string | null;
  name_kana: string | null;
  group_type: string | null;
  email: string | null;
  phone: string | null;
  phone_available: string | null;
  check_in: string;
  check_out: string | null;
  nights: number;
  guest_total: string | null;
  inquiry: string | null;
  linked_reservation_id: string | null;
  reject_reason: string | null;
  internal_memo: string | null;
  reply_email_sent: boolean;
  reply_email_sent_at: string | null;
  is_archived: boolean;
  sheet_created_at: string;
  sheet_updated_at: string;
  synced_at: string;
};

function g(
  values: unknown[],
  index: Record<string, number>,
  key: string
): unknown {
  return getCell(values, index, key);
}

/** リクエストフォーム行 → reservation_requests */
export function mapRequestFormRow(
  row: SheetRow,
  headers: string[],
  requestId: string,
  now: Date,
  options: { validateBookingHorizon?: boolean } = {}
): RequestInsert {
  const idx = headerIndex(headers);
  const v = row.values;
  const nowIso = now.toISOString();
  const today = businessToday();

  const lastName = String(g(v, idx, "姓") ?? "").trim();
  const firstName = String(g(v, idx, "名") ?? "").trim();
  const lastNameKana = String(g(v, idx, "姓ふりがな") ?? "").trim();
  const firstNameKana = String(g(v, idx, "名ふりがな") ?? "").trim();

  const checkIn = buildCheckInDate(
    "",
    g(v, idx, "チェックイン月"),
    g(v, idx, "チェックイン日"),
    today
  );
  if (!checkIn) {
    throw new Error(`チェックイン日が不正（行${row.sheetRow}）`);
  }
  if (
    options.validateBookingHorizon !== false &&
    !isCheckInWithinBookingHorizon(checkIn, today)
  ) {
    throw new Error(
      `チェックインが受付可能範囲外（1年以上先または過去日・行${row.sheetRow}）`
    );
  }

  const checkOut = buildCheckOutDate(
    checkIn,
    "",
    g(v, idx, "チェックアウト月"),
    g(v, idx, "チェックアウト日")
  );

  return {
    request_id: requestId,
    access_key: generateAccessKey(),
    import_row_id: String(row.sheetRow),
    status: DEFAULTS.requestStatus,
    last_name: lastName || null,
    first_name: firstName || null,
    representative_name: joinName(lastName, firstName) || null,
    last_name_kana: lastNameKana || null,
    first_name_kana: firstNameKana || null,
    name_kana: joinName(lastNameKana, firstNameKana) || null,
    group_type: asTextField(g(v, idx, "グループ形態")) || null,
    email:
      String(g(v, idx, "メールアドレス") ?? "")
        .trim()
        .toLowerCase() || null,
    phone: asPhoneString(g(v, idx, "電話番号")) || null,
    phone_available: asTextField(g(v, idx, "電話可能時間")) || null,
    check_in: formatDateIso(checkIn),
    check_out: checkOut ? formatDateIso(checkOut) : null,
    nights: calculateNights(checkIn, checkOut),
    guest_total: normalizeGuestTotalForStorage(asTextField(g(v, idx, "人数"))),
    inquiry: asTextField(g(v, idx, "お問い合わせ内容")) || null,
    linked_reservation_id: null,
    reject_reason: null,
    internal_memo: null,
    reply_email_sent: false,
    reply_email_sent_at: null,
    is_archived: false,
    sheet_created_at: nowIso,
    sheet_updated_at: nowIso,
    synced_at: nowIso,
  };
}

export function isRequestRowImportable(
  row: SheetRow,
  headers: string[]
): boolean {
  const idx = headerIndex(headers);
  const v = row.values;
  const lastName = String(getCell(v, idx, "姓") ?? "").trim();
  const ciMonth = getCell(v, idx, "チェックイン月");
  return Boolean(lastName && ciMonth);
}

/** 02_予約リクエスト台帳 CSV */
export function mapRequestCsvRow(
  record: Record<string, unknown>,
  isArchived: boolean
): RequestInsert | null {
  const requestId = String(record["リクエストID"] ?? "").trim();
  if (!requestId) return null;

  const checkInRaw = String(record["チェックイン日"] ?? "").trim();
  const checkOutRaw = asTextField(record["チェックアウト日"]);
  const checkInParsed = parseDateValue(checkInRaw);
  const checkOutParsed = parseDateValue(checkOutRaw);
  if (!checkInParsed) return null;

  const checkIn = formatDateIso(checkInParsed);

  const toTs = (v: unknown) => {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  return {
    request_id: requestId,
    access_key: String(record["外部受付キー"] ?? "").trim(),
    import_row_id: String(record["取込行ID"] ?? "").trim(),
    status: String(record["ステータス"] ?? DEFAULTS.requestStatus).trim(),
    last_name: asTextField(record["姓"]) || null,
    first_name: asTextField(record["名"]) || null,
    representative_name: asTextField(record["代表者名"]) || null,
    last_name_kana: asTextField(record["姓ふりがな"]) || null,
    first_name_kana: asTextField(record["名ふりがな"]) || null,
    name_kana: asTextField(record["ふりがな"]) || null,
    group_type: asTextField(record["グループ形態"]) || null,
    email: asTextField(record["メールアドレス"]).toLowerCase() || null,
    phone: asPhoneString(record["電話番号"]) || null,
    phone_available: asTextField(record["電話可能時間"]) || null,
    check_in: checkIn,
    check_out: checkOutParsed ? formatDateIso(checkOutParsed) : null,
    nights: Number(record["泊数"]) || 0,
    guest_total: normalizeGuestTotalForStorage(asTextField(record["宿泊人数"])),
    inquiry: asTextField(record["お問い合わせ内容"]) || null,
    linked_reservation_id: asTextField(record["連携予約ID"]) || null,
    reject_reason: asTextField(record["却下理由"]) || null,
    internal_memo:
      asTextField(record["運用メモ"]) ||
      asTextField(record["内部メモ"]) ||
      null,
    reply_email_sent: String(record["返信メール送付済"] ?? "").toUpperCase() === "TRUE",
    reply_email_sent_at: toTs(record["返信メール送付日時"]),
    is_archived: isArchived,
    sheet_created_at: toTs(record["作成日時"]) ?? new Date().toISOString(),
    sheet_updated_at: toTs(record["更新日時"]) ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };
}

/** Supabase テーブルエクスポート CSV（request_id 列） */
export function mapRequestDbExportRow(
  record: Record<string, unknown>
): RequestInsert | null {
  const requestId = String(record["request_id"] ?? "").trim();
  if (!requestId) return null;

  const checkIn = String(record["check_in"] ?? "").trim();
  if (!checkIn) return null;

  const toTs = (v: unknown) => {
    if (v === "" || v == null) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d.toISOString();
  };
  const toBool = (v: unknown) =>
    String(v ?? "").toLowerCase() === "true" || String(v) === "1";

  return {
    request_id: requestId,
    access_key: String(record["access_key"] ?? "").trim(),
    import_row_id: String(record["import_row_id"] ?? "").trim(),
    status: String(record["status"] ?? DEFAULTS.requestStatus).trim(),
    last_name: asTextField(record["last_name"]) || null,
    first_name: asTextField(record["first_name"]) || null,
    representative_name: asTextField(record["representative_name"]) || null,
    last_name_kana: asTextField(record["last_name_kana"]) || null,
    first_name_kana: asTextField(record["first_name_kana"]) || null,
    name_kana: asTextField(record["name_kana"]) || null,
    group_type: asTextField(record["group_type"]) || null,
    email: asTextField(record["email"]).toLowerCase() || null,
    phone: asPhoneString(record["phone"]) || null,
    phone_available: asTextField(record["phone_available"]) || null,
    check_in: checkIn.slice(0, 10),
    check_out: asTextField(record["check_out"]).slice(0, 10) || null,
    nights: Number(record["nights"]) || 0,
    guest_total: normalizeGuestTotalForStorage(asTextField(record["guest_total"])),
    inquiry: asTextField(record["inquiry"]) || null,
    linked_reservation_id: asTextField(record["linked_reservation_id"]) || null,
    reject_reason: asTextField(record["reject_reason"]) || null,
    internal_memo: asTextField(record["internal_memo"]) || null,
    reply_email_sent: toBool(record["reply_email_sent"]),
    reply_email_sent_at: toTs(record["reply_email_sent_at"]),
    is_archived: toBool(record["is_archived"]),
    sheet_created_at: toTs(record["sheet_created_at"]) ?? new Date().toISOString(),
    sheet_updated_at: toTs(record["sheet_updated_at"]) ?? new Date().toISOString(),
    synced_at: new Date().toISOString(),
  };
}

export function isRequestDbExportRecord(record: Record<string, unknown>) {
  return Boolean(String(record["request_id"] ?? "").trim());
}
