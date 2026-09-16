import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateHistoricalLodgingPayment,
  mapHistoricalGuestExtras,
  type HistoricalChargeInsert,
} from "@/lib/import/historical-guest-mapper";
import { normalizeGuestBreakdownForStorage, normalizeGuestTotalForStorage } from "@/lib/utils/guest-count-format";
import {
  ARRIVAL_TIME_OPTIONS,
  BBQ_OPTIONS,
  GROUP_TYPE_OPTIONS,
  MEAL_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  REFERRAL_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVEL_PURPOSE_OPTIONS,
  parseMultiSelectValues,
} from "@/lib/config/field-options";

type JsonRecord = {
  import_key?: string;
  source?: { sha256?: string; year_folder?: string; file_name?: string };
  fields?: Record<string, unknown>;
  review?: { status?: string; memo?: string };
};

export type HistoricalImportItem = {
  importKey: string;
  importRowId: string;
  reservationId: string;
  reservation: Record<string, unknown>;
  companions: Record<string, unknown>[];
  rooms: Record<string, unknown>[];
  charges: HistoricalChargeInsert[];
  warnings: string[];
};

const ROOM_IDS: Record<string, string> = {
  "理科室": "R01",
  "理科室・ランチルーム": "R01",
  "ランチルーム": "R01",
  "低学年室": "R02",
  "児童室（低）": "R02",
  "高学年室": "R03",
  "児童室（高）": "R03",
  "保健室": "R04",
  "音楽室": "R05",
  "図書室": "R06",
};

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function int(value: unknown): number | null {
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function normalizedGender(value: unknown): string | null {
  const raw = text(value);
  if (raw === "男") return "男性";
  if (raw === "女") return "女性";
  return raw;
}

function splitMulti(value: unknown): string[] {
  return String(value ?? "")
    .replace(/理科室\s*・\s*ランチルーム/g, "理科室")
    .split(/[、,，／/・\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stableId(prefix: string, source: string, length = 16): string {
  return `${prefix}-${createHash("sha256").update(source).digest("hex").slice(0, length)}`;
}

function historicalReservationId(importKey: string, year: string): string {
  const fileName = importKey.replace(/\\/g, "/").split("/").pop() ?? "";
  const stem = fileName.replace(/\.[^.]+$/, "");
  const match = stem.match(/(\d+)$/);
  if (!match) throw new Error(`${importKey}: ファイル名末尾に連番がありません`);
  return `PAST-${year}-${match[1].padStart(3, "0")}`;
}

function appendPastMemo(base: string | null, fields: Record<string, unknown>): string | null {
  const parts = base ? [base] : [];
  const reservationDate = text(fields["予約日"]);
  if (reservationDate) parts.push(`予約日: ${reservationDate}`);
  return parts.length ? parts.join("\n") : null;
}

function warnIfOutside(
  warnings: string[],
  label: string,
  value: unknown,
  options: readonly string[],
  multi = false
) {
  const values = multi ? parseMultiSelectValues(text(value)) : [text(value)].filter(Boolean) as string[];
  const outside = values.filter((item) => !options.includes(item));
  if (outside.length) warnings.push(`${label}が選択肢外: ${outside.join("、")}`);
}

export function mapHistoricalGuestRecord(record: JsonRecord): HistoricalImportItem {
  const fields = record.fields ?? {};
  const importKey = text(record.import_key) ?? "";
  const sha256 = text(record.source?.sha256);
  if (!importKey || !sha256) throw new Error("import_key または source.sha256 がありません");
  const year = text(record.source?.year_folder) ?? importKey.split("/")[0] ?? "unknown";
  const importRowId = `sha256:${sha256}`;
  const reservationId = historicalReservationId(importKey, year);
  const checkIn = text(fields["チェックイン日"]);
  const checkOut = text(fields["チェックアウト日"]);
  const warnings: string[] = [];
  if (!checkIn) warnings.push("チェックイン日が空欄");
  if (!checkOut) warnings.push("チェックアウト日が空欄");
  if (text(record.review?.status) !== "確認済") warnings.push("確認状態が確認済ではありません");
  warnIfOutside(warnings, "グループ形態", fields["グループ形態"], GROUP_TYPE_OPTIONS);
  warnIfOutside(warnings, "利用目的", fields["利用目的"], TRAVEL_PURPOSE_OPTIONS, true);
  warnIfOutside(warnings, "紹介元", fields["紹介元"], REFERRAL_OPTIONS);
  warnIfOutside(warnings, "到着時間", fields["到着時間"], ARRIVAL_TIME_OPTIONS);
  warnIfOutside(warnings, "交通手段", fields["交通手段"], TRANSPORT_OPTIONS);
  warnIfOutside(warnings, "食事", fields["食事"], MEAL_OPTIONS);
  warnIfOutside(warnings, "BBQレンタル", fields["BBQレンタル"], BBQ_OPTIONS);
  warnIfOutside(warnings, "入金状況", fields["入金状況"], PAYMENT_STATUS_OPTIONS);
  warnIfOutside(warnings, "支払方法", fields["支払方法"], ["Cash", "Pay", "Airbnb", "振込", "その他"]);

  const extras = mapHistoricalGuestExtras(fields);
  const lodgingPayment = evaluateHistoricalLodgingPayment(fields);
  const lastName = text(fields["代表者姓"]);
  const firstName = text(fields["代表者名"]);
  const representativeName = [lastName, firstName].filter(Boolean).join(" ") || null;
  const lastKana = text(fields["ふりがな_姓"]);
  const firstKana = text(fields["ふりがな_名"]);
  const nameKana = [lastKana, firstKana].filter(Boolean).join(" ") || null;
  const now = new Date().toISOString();

  const companions: Record<string, unknown>[] = [];
  for (let index = 1; index <= 100; index++) {
    const name = text(fields[`同行者${index}_氏名`]);
    if (!name) continue;
    companions.push({
      reservation_id: reservationId,
      entry_no: index,
      name,
      name_kana: null,
      age: text(fields[`同行者${index}_年齢`]),
      gender: normalizedGender(fields[`同行者${index}_性別`]),
      source: "過去帳票",
      answered_at: now,
      updated_at: now,
    });
  }

  const roomNames = splitMulti(fields["部屋"]);
  const rooms: Record<string, unknown>[] = [];
  const seenRoomIds = new Set<string>();
  for (const roomNameRaw of roomNames) {
    const roomId = ROOM_IDS[roomNameRaw];
    if (!roomId) {
      warnings.push(`未対応の部屋: ${roomNameRaw}`);
      continue;
    }
    if (seenRoomIds.has(roomId)) continue;
    seenRoomIds.add(roomId);
    if (!checkIn || !checkOut) {
      warnings.push(`日付不足のため部屋割を作成できません: ${roomNameRaw}`);
      continue;
    }
    const roomName = roomId === "R01" ? "理科室" : roomNameRaw.replace("児童室（低）", "低学年室").replace("児童室（高）", "高学年室");
    rooms.push({
      room_assignment_id: stableId("PAST-ROOM", `${importRowId}:${roomId}`, 20),
      reservation_id: reservationId,
      room_id: roomId,
      room_name: roomName,
      stay_start: checkIn,
      stay_end: checkOut,
      assigned_guest_count: null,
      display_memo: null,
      assignment_memo: "過去帳票から取込",
      is_archived: true,
      synced_at: now,
    });
  }

  const reservation = {
    reservation_id: reservationId,
    access_key: null,
    import_source: "過去取込",
    import_row_id: importRowId,
    request_id: null,
    channel: "過去帳票",
    status: "確定",
    last_name: lastName,
    first_name: firstName,
    representative_name: representativeName,
    last_name_kana: lastKana,
    first_name_kana: firstKana,
    name_kana: nameKana,
    representative_age: extras.representativeAge,
    representative_gender: extras.representativeGender,
    group_type: text(fields["グループ形態"]),
    group_name: text(fields["団体名"]),
    email: text(fields["メールアドレス"])?.toLowerCase() ?? null,
    phone: text(fields["電話番号"])?.replace(/\D/g, "") || null,
    postal_code: text(fields["郵便番号"]),
    prefecture: text(fields["都道府県"]),
    city: text(fields["市区町村"]),
    address_line: text(fields["住所"]),
    address: [text(fields["都道府県"]), text(fields["市区町村"]), text(fields["住所"])].filter(Boolean).join("") || null,
    check_in: checkIn,
    check_out: checkOut,
    nights: int(fields["滞在日数"]),
    guest_total: normalizeGuestTotalForStorage(text(fields["宿泊人数"]) ?? ""),
    adult_male: normalizeGuestBreakdownForStorage(text(fields["中学生以上男性"]) ?? ""),
    adult_female: normalizeGuestBreakdownForStorage(text(fields["中学生以上女性"]) ?? ""),
    boy_student: normalizeGuestBreakdownForStorage(text(fields["小学生男の子"]) ?? ""),
    girl_student: normalizeGuestBreakdownForStorage(text(fields["小学生女の子"]) ?? ""),
    age_3plus: normalizeGuestBreakdownForStorage(text(fields["3歳以上幼児"]) ?? ""),
    under_3: normalizeGuestBreakdownForStorage(text(fields["3歳未満乳幼児"]) ?? ""),
    arrival_time: text(fields["到着時間"]),
    transport: text(fields["交通手段"]),
    meal: text(fields["食事"]),
    bbq: text(fields["BBQレンタル"]),
    inquiry: null,
    travel_purpose: text(fields["利用目的"]),
    referral: text(fields["紹介元"]),
    assignment_status: rooms.length ? "割当済" : "未割当",
    companion_form_answered: companions.length > 0,
    payment_method: text(fields["支払方法"]),
    payment_status: lodgingPayment.complete ? "完了" : "未払い",
    customer_id: null,
    internal_memo: text(record.review?.memo) ?? text(fields["運用メモ"]),
    guest_memo: appendPastMemo(extras.guestMemo, fields),
    gcal_event_id: null,
    is_archived: true,
    synced_at: now,
    updated_at: now,
  };

  return { importKey, importRowId, reservationId, reservation, companions, rooms, charges: extras.charges, warnings };
}

export async function findExistingHistoricalReservations(supabase: SupabaseClient, year: string) {
  const { data, error } = await supabase
    .from("reservations")
    .select("reservation_id,import_row_id")
    .eq("import_source", "過去取込")
    .gte("check_in", `${year}-01-01`)
    .lte("check_in", `${year}-12-31`);
  if (error) throw error;
  return data ?? [];
}
