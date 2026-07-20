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

/** 仮予約・確定はアーカイブ済み・過去分もカレンダーに残す（キャンセルのみ除外） */
function isGCalTarget(
  row: Pick<ReservationRow, "status" | "check_in" | "check_out">
) {
  if (row.status !== "仮予約" && row.status !== "確定") return false;
  if (!row.check_in || !row.check_out) return false;
  return true;
}

function shouldRemoveFromGCal(row: Pick<ReservationRow, "status">) {
  return row.status === "キャンセル";
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
  lines.push(`人数: ${guestStr && guestStr !== "—" ? guestStr : "不明"}`);
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
    .eq("reservation_id", reservationId);
  return formatAssignedRoomsLabel(data ?? []);
}

/** キャンセル予約の GCal イベント削除（ID がある場合＋説明文の予約ID検索） */
async function removeCancelledReservationFromGCal(
  calendar: ReturnType<typeof createCalendarClient>,
  calendarId: string,
  row: ReservationRow
): Promise<{ clearedDb: boolean; error?: string }> {
  const ids = new Set<string>();
  if (row.gcal_event_id) ids.add(row.gcal_event_id);

  // gcal_event_id 欠落や ID ずれの取り残しを、説明文の「予約ID: xxx」で拾う
  if (row.check_in && row.check_out) {
    try {
      const listed = await calendar.events.list({
        calendarId,
        timeMin: `${row.check_in}T00:00:00Z`,
        timeMax: `${row.check_out}T00:00:00Z`,
        singleEvents: true,
        maxResults: 50,
      });
      const needle = `予約ID: ${row.reservation_id}`;
      for (const ev of listed.data.items ?? []) {
        const desc = String(ev.description ?? "");
        if (ev.id && desc.includes(needle)) ids.add(ev.id);
      }
    } catch (e) {
      return {
        clearedDb: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  for (const eventId of ids) {
    try {
      await calendar.events.delete({ calendarId, eventId });
    } catch {
      /* 既に削除済み */
    }
  }

  return { clearedDb: ids.size > 0 };
}

/** 同一予約の同期を直列化（古い after が新しい結果を上書きしないようにする） */
const syncChains = new Map<string, Promise<unknown>>();

export async function syncReservationToGCal(
  supabase: SupabaseClient,
  reservationId: string
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const prev = syncChains.get(reservationId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  syncChains.set(reservationId, chained);

  try {
    await prev.catch(() => undefined);
    return await syncReservationToGCalUnlocked(supabase, reservationId);
  } finally {
    release();
    if (syncChains.get(reservationId) === chained) {
      syncChains.delete(reservationId);
    }
  }
}

async function syncReservationToGCalUnlocked(
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

  if (!isGCalTarget(row)) {
    // キャンセル等: 紐づくイベントを削除。ID 欠落時は説明文の予約IDで救済検索
    if (shouldRemoveFromGCal(row)) {
      const removed = await removeCancelledReservationFromGCal(
        calendar,
        calendarId,
        row as ReservationRow
      );
      if (removed.error) return { ok: false, error: removed.error };
      if (row.gcal_event_id || removed.clearedDb) {
        // 作業中にステータスが戻っていたらクリアしない
        const { data: latest } = await supabase
          .from("reservations")
          .select("status")
          .eq("reservation_id", reservationId)
          .maybeSingle();
        if (latest && shouldRemoveFromGCal(latest)) {
          await supabase
            .from("reservations")
            .update({
              gcal_event_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("reservation_id", reservationId)
            .eq("status", "キャンセル");
        }
      }
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
      // insert 後にキャンセル等へ変わっていたら、作ったイベントを捨てて書き戻さない
      const { data: latest } = await supabase
        .from("reservations")
        .select("status")
        .eq("reservation_id", reservationId)
        .maybeSingle();
      if (!latest || !isGCalTarget(latest)) {
        try {
          await calendar.events.delete({ calendarId, eventId });
        } catch {
          /* ignore */
        }
        if (latest && shouldRemoveFromGCal(latest)) {
          await removeCancelledReservationFromGCal(
            calendar,
            calendarId,
            {
              ...(row as ReservationRow),
              status: latest.status,
              gcal_event_id: null,
            }
          );
          await supabase
            .from("reservations")
            .update({
              gcal_event_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("reservation_id", reservationId)
            .eq("status", "キャンセル");
        }
        return { ok: true, skipped: true };
      }

      await supabase
        .from("reservations")
        .update({
          gcal_event_id: eventId,
          updated_at: new Date().toISOString(),
        })
        .eq("reservation_id", reservationId)
        .in("status", ["仮予約", "確定"]);
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 仮予約・確定を一括同期（アーカイブ済み・過去分を含む。初回投入後の sync:gcal 用） */
export async function syncAllActiveReservationsToGCal(
  supabase: SupabaseClient
): Promise<{ synced: number; errors: string[] }> {
  if (!isGCalConfigured()) return { synced: 0, errors: [] };

  const { data, error } = await supabase
    .from("reservations")
    .select("reservation_id")
    .in("status", ["仮予約", "確定"]);

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

/** 連携仮予約の差し戻しなど、DB から予約を消すときだけ GCal イベントを削除 */
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
