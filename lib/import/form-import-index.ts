import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingEntryMatchesForLink,
  contactMatches,
  nameMatches,
  stayMatches,
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
  "reservation_id, import_row_id, access_key, status, check_in, check_out, last_name, first_name, email, phone, request_id, is_archived";

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
  return reservations.find((r) => r.import_row_id === rowId);
}

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
    if (!nameMatches(req.last_name, req.first_name, row.last_name, row.first_name)) {
      return false;
    }
    if (!contactMatches(req.email, req.phone, row.email, row.phone)) return false;
    return stayMatches(req.check_in, req.check_out, row.check_in, row.check_out);
  });
}

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
    if (r.status === "キャンセル") return false;
    return bookingEntryMatchesForLink(r, row);
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
