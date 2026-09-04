import type { SupabaseClient } from "@supabase/supabase-js";
import { syncSequencesFromLedger } from "@/lib/import/id-generation";

/**
 * reservation_id を参照するテーブル・カラム（マイグレーションより）。
 *
 * - reservations.reservation_id … PK
 * - reservation_requests.linked_reservation_id … FK → reservations
 * - room_assignments.reservation_id … FK → reservations
 * - companions.reservation_id … FK → reservations (ON DELETE CASCADE)
 * - form_import_log.reservation_id … FK → reservations
 * - mail_logs.entity_id … entity_type='reservation' のとき（FKなし）
 *
 * Looker / occupancy ビューは実テーブルを参照するだけなので更新不要。
 */

export type ReservationIdRefCounts = {
  roomAssignments: number;
  companions: number;
  linkedRequests: number;
  formImportLogs: number;
  mailLogs: number;
};

export type RenameReservationIdResult = {
  fromId: string;
  toId: string;
  representativeName: string | null;
  updated: ReservationIdRefCounts;
};

function normalizeId(value: string): string {
  return String(value ?? "").trim();
}

async function countEq(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string,
  extra?: { column: string; value: string }
): Promise<number> {
  let q = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (extra) q = q.eq(extra.column, extra.value);
  const { count, error } = await q;
  if (error) throw new Error(`${table}.${column}: ${error.message}`);
  return count ?? 0;
}

/** 変更前プレビュー用: 旧IDに紐づく件数 */
export async function countReservationIdReferences(
  supabase: SupabaseClient,
  reservationId: string
): Promise<ReservationIdRefCounts> {
  const id = normalizeId(reservationId);
  const [roomAssignments, companions, linkedRequests, formImportLogs, mailLogs] =
    await Promise.all([
      countEq(supabase, "room_assignments", "reservation_id", id),
      countEq(supabase, "companions", "reservation_id", id),
      countEq(supabase, "reservation_requests", "linked_reservation_id", id),
      countEq(supabase, "form_import_log", "reservation_id", id),
      countEq(supabase, "mail_logs", "entity_id", id, {
        column: "entity_type",
        value: "reservation",
      }),
    ]);
  return {
    roomAssignments,
    companions,
    linkedRequests,
    formImportLogs,
    mailLogs,
  };
}

async function assertCanRename(
  supabase: SupabaseClient,
  fromId: string,
  toId: string
): Promise<{ representativeName: string | null }> {
  if (!fromId) throw new Error("変更元の予約IDを入力してください。");
  if (!toId) throw new Error("変更先の予約IDを入力してください。");
  if (fromId === toId) {
    throw new Error("変更元と変更先が同じです。");
  }

  const { data: fromRow, error: fromErr } = await supabase
    .from("reservations")
    .select("reservation_id, representative_name")
    .eq("reservation_id", fromId)
    .maybeSingle();
  if (fromErr) throw new Error(fromErr.message);
  if (!fromRow) {
    throw new Error(`変更元の予約が見つかりません: ${fromId}`);
  }

  const { data: toRow, error: toErr } = await supabase
    .from("reservations")
    .select("reservation_id")
    .eq("reservation_id", toId)
    .maybeSingle();
  if (toErr) throw new Error(toErr.message);
  if (toRow) {
    throw new Error(
      `変更先のIDは既に存在します: ${toId}。別のIDを指定してください。`
    );
  }

  return {
    representativeName: (fromRow.representative_name as string | null) ?? null,
  };
}

/**
 * 予約IDを1件リネームし、紐づく全参照を新IDへ付け替える。
 * PK変更のため insert(新) → 参照更新 → delete(旧) の順で実行する。
 */
export async function renameReservationId(
  supabase: SupabaseClient,
  input: { fromId: string; toId: string }
): Promise<RenameReservationIdResult> {
  const fromId = normalizeId(input.fromId);
  const toId = normalizeId(input.toId);
  const { representativeName } = await assertCanRename(supabase, fromId, toId);

  const updated = await countReservationIdReferences(supabase, fromId);
  const now = new Date().toISOString();

  const { data: oldRow, error: fetchErr } = await supabase
    .from("reservations")
    .select("*")
    .eq("reservation_id", fromId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const { error: insertErr } = await supabase.from("reservations").insert({
    ...(oldRow as Record<string, unknown>),
    reservation_id: toId,
    updated_at: now,
  });
  if (insertErr) throw new Error(`予約の複製に失敗: ${insertErr.message}`);

  const fail = (label: string, message: string) => {
    throw new Error(`${label} の付け替えに失敗: ${message}`);
  };

  {
    const { error } = await supabase
      .from("room_assignments")
      .update({ reservation_id: toId, updated_at: now })
      .eq("reservation_id", fromId);
    if (error) fail("room_assignments", error.message);
  }
  {
    const { error } = await supabase
      .from("companions")
      .update({ reservation_id: toId })
      .eq("reservation_id", fromId);
    if (error) fail("companions", error.message);
  }
  {
    const { error } = await supabase
      .from("reservation_requests")
      .update({ linked_reservation_id: toId, updated_at: now })
      .eq("linked_reservation_id", fromId);
    if (error) fail("reservation_requests.linked_reservation_id", error.message);
  }
  {
    const { error } = await supabase
      .from("form_import_log")
      .update({ reservation_id: toId, imported_at: now })
      .eq("reservation_id", fromId);
    if (error) fail("form_import_log", error.message);
  }
  {
    const { error } = await supabase
      .from("mail_logs")
      .update({ entity_id: toId })
      .eq("entity_type", "reservation")
      .eq("entity_id", fromId);
    if (error) fail("mail_logs", error.message);
  }

  const { error: deleteErr } = await supabase
    .from("reservations")
    .delete()
    .eq("reservation_id", fromId);
  if (deleteErr) {
    throw new Error(`旧予約の削除に失敗: ${deleteErr.message}`);
  }

  await syncSequencesFromLedger(supabase);

  return { fromId, toId, representativeName, updated };
}
