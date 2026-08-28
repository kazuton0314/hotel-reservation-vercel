import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkInMatchesExact,
  contactMatches,
  nameMatches,
  sameImportIdentity,
  stayMatchesExact,
} from "@/lib/import/match-utils";

export type RequestImportRecord = {
  request_id: string;
  import_row_id: string | null;
  access_key: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  linked_reservation_id: string | null;
  reject_reason: string | null;
  internal_memo: string | null;
  reply_email_sent: boolean;
  reply_email_sent_at: string | null;
  sheet_created_at: string | null;
  is_archived: boolean;
};

export type ReservationImportRecord = {
  reservation_id: string;
  import_row_id: string | null;
  import_source: string | null;
  access_key: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  request_id: string | null;
  is_archived: boolean;
};

const REQUEST_SELECT =
  "request_id, import_row_id, access_key, status, check_in, check_out, last_name, first_name, email, phone, linked_reservation_id, reject_reason, internal_memo, reply_email_sent, reply_email_sent_at, sheet_created_at, is_archived";

const RESERVATION_SELECT =
  "reservation_id, import_row_id, import_source, access_key, status, check_in, check_out, last_name, first_name, email, phone, request_id, is_archived";

/** 過去取込CSVは別スプシ由来のため、現行フォームの行番号と衝突しうる */
export function isPastImportSource(importSource: string | null | undefined): boolean {
  return String(importSource ?? "").trim() === "過去取込";
}

/** 取込済み判定用: アーカイブ含む全リクエスト */
export async function loadAllRequestsForImport(
  supabase: SupabaseClient
): Promise<RequestImportRecord[]> {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select(REQUEST_SELECT);
  if (error) throw error;
  return (data ?? []) as RequestImportRecord[];
}

/** 取込済み判定用: アーカイブ含む全予約 */
export async function loadAllReservationsForImport(
  supabase: SupabaseClient
): Promise<ReservationImportRecord[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT);
  if (error) throw error;
  return (data ?? []) as ReservationImportRecord[];
}

export function findRequestByImportRowId(
  requests: RequestImportRecord[],
  sheetRow: number
) {
  const rowId = String(sheetRow);
  return requests.find((req) => req.import_row_id === rowId);
}

export function findReservationByImportRowId(
  reservations: ReservationImportRecord[],
  sheetRow: number
) {
  const rowId = String(sheetRow);
  return reservations.find((r) => {
    if (r.import_row_id !== rowId) return false;
    // 本予約フォーム（STUDIO）の行番号衝突のみ判定対象にする。
    // request / past の import_row_id は同じ数値でも別空間。
    return String(r.import_source ?? "").trim() === "STUDIO";
  });
}

/** import_row_id 一致かつ同一人物・同一チェックインのときだけ「取込済み」 */
export function findOwnedReservationByImportRow(
  reservations: ReservationImportRecord[],
  sheetRow: number,
  incoming: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
  }
) {
  const byRow = findReservationByImportRowId(reservations, sheetRow);
  if (!byRow) return null;
  return sameImportIdentity(byRow, incoming) ? byRow : null;
}

export function findOwnedRequestByImportRow(
  requests: RequestImportRecord[],
  sheetRow: number,
  incoming: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
  }
) {
  const byRow = findRequestByImportRowId(requests, sheetRow);
  if (!byRow) return null;
  return sameImportIdentity(byRow, incoming) ? byRow : null;
}

export { sameImportIdentity };

/**
 * 取込時の「同一リクエスト」判定（内容ベース）。
 * 注意: 取込スキップには使わない。スプシ行 (import_row_id) ごとに別 RQ を発行する。
 * リンク照合など別用途向け。
 */
export function findDuplicateRequest(
  requests: RequestImportRecord[],
  row: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
    check_out: string | null;
  }
) {
  return requests.find((req) => {
    if (req.is_archived) return false;
    if (!nameMatches(req.last_name, req.first_name, row.last_name, row.first_name)) {
      return false;
    }
    if (!contactMatches(req.email, req.phone, row.email, row.phone)) return false;
    return stayMatchesExact(
      req.check_in,
      req.check_out,
      row.check_in,
      row.check_out
    );
  });
}

/**
 * 取込時の「同一本予約」判定（ハード重複）。
 * アーカイブ・キャンセル除外。チェックインは年月日の完全一致のみ。
 * 仮予約→確定の更新は sync 側のマッチ処理で行う（ここではスキップしない想定）。
 */
export function findDuplicateReservation(
  reservations: ReservationImportRecord[],
  row: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
  }
) {
  return reservations.find((r) => {
    if (r.is_archived || r.status === "キャンセル") return false;
    if (!checkInMatchesExact(r.check_in, row.check_in)) return false;
    if (!nameMatches(r.last_name, r.first_name, row.last_name, row.first_name)) {
      return false;
    }
    return contactMatches(r.email, r.phone, row.email, row.phone);
  });
}

export async function logRequestFormImport(
  supabase: SupabaseClient,
  sourceRow: number,
  requestId: string
) {
  const { error } = await supabase.from("form_import_log").upsert(
    { source: "request", source_row: sourceRow, request_id: requestId },
    { onConflict: "source,source_row" }
  );
  if (error) throw error;
}

export async function logStudioFormImport(
  supabase: SupabaseClient,
  sourceRow: number,
  reservationId: string
) {
  const { error } = await supabase.from("form_import_log").upsert(
    { source: "studio", source_row: sourceRow, reservation_id: reservationId },
    { onConflict: "source,source_row" }
  );
  if (error) throw error;
}
