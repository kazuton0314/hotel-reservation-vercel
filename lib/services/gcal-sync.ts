import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatGuestCompact } from "@/lib/utils/guest-display";

type ReservationRow = {
  reservation_id: string;
  representative_name: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
  arrival_time: string | null;
  meal: string | null;
  bbq: string | null;
  transport: string | null;
  vehicle_count: string | null;
  group_name: string | null;
  channel: string | null;
  inquiry: string | null;
  internal_memo: string | null;
  gcal_event_id: string | null;
  is_archived: boolean;
};

const RESERVATION_SELECT =
  "reservation_id, representative_name, status, check_in, check_out, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, arrival_time, meal, bbq, transport, vehicle_count, group_name, channel, inquiry, internal_memo, gcal_event_id, is_archived";

function getCalendarId(): string | null {
  const id = process.env.GOOGLE_CALENDAR_ID?.trim();
  return id || null;
}

function createCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );
  if (!email || !privateKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が未設定です"
    );
  }
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth });
}

export function isGCalConfigured(): boolean {
  return Boolean(
    getCalendarId() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function isGCalTarget(row: Pick<ReservationRow, "status" | "check_out" | "is_archived">) {
  if (row.is_archived) return false;
  if (row.status !== "仮予約" && row.status !== "確定") return false;
  if (!row.check_out) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const co = new Date(`${row.check_out}T00:00:00`);
  return co.getTime() >= cutoff.getTime();
}

function formatAssignedRoomsLabel(
  assignments: { room_name: string | null }[]
): string {
  const label = assignments
    .map((a) => String(a.room_name ?? "").trim())
    .filter(Boolean)
    .join(" / ");
  return label || "未割当";
}

/** GAS buildGCalEventTitle_ 相当 */
function buildGCalEventTitle(row: ReservationRow): string {
  const guestLabel = formatGuestCompact(row);
  const guestPart =
    guestLabel && guestLabel !== "—" ? `（${guestLabel}）` : "";
  return `宿泊 ${row.representative_name || ""}様${guestPart}`;
}

/** GAS buildGCalEventDescription_ 相当 */
function buildGCalEventDescription(
  row: ReservationRow,
  roomNames: string
): string {
  const guestStr = formatGuestCompact(row);
  const lines: string[] = [];
  lines.push(
    `人数: ${guestStr && guestStr !== "—" ? guestStr : row.guest_total || "不明"}`
  );
  lines.push(`部屋割: ${roomNames}`);
  if (row.arrival_time) lines.push(`到着: ${row.arrival_time}`);
  if (row.meal) lines.push(`食事: ${row.meal}`);
  if (row.bbq) lines.push(`BBQ: ${row.bbq}`);
  if (row.transport || row.vehicle_count) {
    const parts: string[] = [];
    const transport = String(row.transport ?? "").trim();
    const vehicle = String(row.vehicle_count ?? "").trim();
    if (transport) parts.push(transport);
    if (vehicle) parts.push(vehicle);
    if (parts.length) lines.push(`交通: ${parts.join(" ")}`);
  }
  if (row.group_name) lines.push(`グループ: ${row.group_name}`);
  if (row.channel) lines.push(`経路: ${row.channel}`);
  lines.push(`ステータス: ${row.status || ""}`);
  if (row.inquiry) lines.push(`問合: ${row.inquiry}`);
  if (row.internal_memo) lines.push(`メモ: ${row.internal_memo}`);
  lines.push(`予約ID: ${row.reservation_id}`);
  return lines.join("\n");
}

function buildEventBody(row: ReservationRow, roomNames: string) {
  return {
    summary: buildGCalEventTitle(row),
    description: buildGCalEventDescription(row, roomNames),
    start: { date: row.check_in! },
    end: { date: row.check_out! },
  };
}

async function loadRoomNames(
  supabase: SupabaseClient,
  reservationId: string
): Promise<string> {
  const { data } = await supabase
    .from("room_assignments")
    .select("room_name")
    .eq("reservation_id", reservationId)
    .eq("is_archived", false);
  return formatAssignedRoomsLabel(data ?? []);
}

export async function syncReservationToGCal(
  supabase: SupabaseClient,
  reservationId: string
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const calendarId = getCalendarId();
  if (!calendarId || !isGCalConfigured()) {
    return { ok: true, skipped: true };
  }

  const { data: row, error } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: true, skipped: true };

  const calendar = createCalendarClient();

  if (!isGCalTarget(row) || !row.check_in || !row.check_out) {
    if (row.gcal_event_id) {
      try {
        await calendar.events.delete({
          calendarId,
          eventId: row.gcal_event_id,
        });
      } catch {
        /* 既に削除済み */
      }
      await supabase
        .from("reservations")
        .update({ gcal_event_id: null, updated_at: new Date().toISOString() })
        .eq("reservation_id", reservationId);
    }
    return { ok: true, skipped: true };
  }

  try {
    const roomNames = await loadRoomNames(supabase, reservationId);
    const body = buildEventBody(row as ReservationRow, roomNames);

    // GAS と同様 delete + recreate で全フィールドを確実に最新化
    if (row.gcal_event_id) {
      try {
        await calendar.events.delete({
          calendarId,
          eventId: row.gcal_event_id,
        });
      } catch {
        /* 既に削除済み */
      }
    }

    const created = await calendar.events.insert({
      calendarId,
      requestBody: body,
    });
    const eventId = created.data.id;
    if (eventId) {
      await supabase
        .from("reservations")
        .update({
          gcal_event_id: eventId,
          updated_at: new Date().toISOString(),
        })
        .eq("reservation_id", reservationId);
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** アクティブ予約を一括同期（Cron / 手動用） */
export async function syncAllActiveReservationsToGCal(
  supabase: SupabaseClient
): Promise<{ synced: number; errors: string[] }> {
  if (!isGCalConfigured()) return { synced: 0, errors: [] };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("reservations")
    .select("reservation_id")
    .eq("is_archived", false)
    .in("status", ["仮予約", "確定"])
    .gte("check_out", cutoffStr);

  if (error) throw error;

  let synced = 0;
  const errors: string[] = [];
  for (const row of data ?? []) {
    const result = await syncReservationToGCal(supabase, row.reservation_id);
    if (result.ok && !result.skipped) synced++;
    if (result.error) errors.push(`${row.reservation_id}: ${result.error}`);
  }
  return { synced, errors };
}

/** 予約削除・アーカイブ前に GCal イベントを削除 */
export async function deleteGCalEventIfAny(gcalEventId: string | null) {
  const calendarId = getCalendarId();
  if (!calendarId || !gcalEventId || !isGCalConfigured()) return;

  try {
    const calendar = createCalendarClient();
    await calendar.events.delete({ calendarId, eventId: gcalEventId });
  } catch {
    /* 既に削除済み */
  }
}
