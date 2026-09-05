import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULTS } from "@/lib/config/forms";
import { csvToRecords } from "@/lib/import/csv-import";
import {
  calculateNights,
  formatDateIso,
  parseDateValue,
} from "@/lib/import/date-utils";
import { generateAccessKey, asPhoneString, asTextField } from "@/lib/import/parsers";
import type { ReservationInsert } from "@/lib/import/reservation-mapper";
import {
  normalizeGuestBreakdownForStorage,
  normalizeGuestTotalForStorage,
} from "@/lib/utils/guest-count-format";

const PAST_ID_PATTERN = /^PAST-(\d{4})-(\d+)$/;
const RA_ID_PATTERN = /^RA-(\d{4})-(\d+)$/;
const IMPORT_SOURCE = "過去取込";
const CHANNEL = "過去データ";

export type PastLedgerImportOptions = {
  batchId: string;
  dryRun?: boolean;
  companionsPath?: string;
};

export type PastLedgerImportResult = {
  dryRun: boolean;
  batchId: string;
  reservations: {
    imported: number;
    skipped: number;
    duplicates: string[];
    warnings: string[];
  };
  roomAssignments: {
    imported: number;
    skipped: number;
    unknownRooms: string[];
  };
  companions: {
    imported: number;
    skipped: number;
    orphanKeys: string[];
  };
  preview: Array<{
    importKey: string;
    reservationId: string;
    checkIn: string | null;
    name: string;
    rooms: string[];
  }>;
};

type ParsedReservationRow = {
  lineNo: number;
  importKey: string;
  checkIn: string;
  checkOut: string;
  representativeName: string;
  nameKana: string | null;
  groupType: string | null;
  groupName: string | null;
  phone: string | null;
  email: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  boyStudent: string | null;
  girlStudent: string | null;
  age3plus: string | null;
  under3: string | null;
  arrivalTime: string | null;
  transport: string | null;
  meal: string | null;
  bbq: string | null;
  roomNames: string[];
  internalMemo: string | null;
  guestMemo: string | null;
};

type ParsedCompanionRow = {
  importKey: string;
  entryNo: number;
  name: string;
  nameKana: string | null;
  age: string | null;
  gender: string | null;
};

function toIsoDate(value: unknown): string | null {
  const d = parseDateValue(value);
  return d ? formatDateIso(d) : null;
}

function normalizePhone(value: string | null): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function duplicateKey(
  checkIn: string | null,
  name: string,
  phone: string | null
): string {
  return `${checkIn ?? ""}|${normalizeName(name)}|${normalizePhone(phone)}`;
}

function parseRoomNames(raw: unknown): string[] {
  const text = asTextField(raw);
  if (!text) return [];
  return text
    .split(/[,、，]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitRepresentativeName(fullName: string): {
  lastName: string | null;
  firstName: string | null;
} {
  const trimmed = fullName.trim();
  if (!trimmed) return { lastName: null, firstName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { lastName: parts[0], firstName: null };
  return { lastName: parts[0], firstName: parts.slice(1).join(" ") };
}

function formatPastReservationId(year: number, seq: number): string {
  return `PAST-${year}-${String(seq).padStart(3, "0")}`;
}

function formatRoomAssignmentId(year: number, seq: number): string {
  return `RA-${year}-${String(seq).padStart(4, "0")}`;
}

function parsePastReservationRow(
  record: Record<string, unknown>,
  lineNo: number
): ParsedReservationRow | null {
  const importKey = asTextField(record["取込キー"]);
  const representativeName = asTextField(record["代表者名"]);
  const checkIn = toIsoDate(record["チェックイン日"]);
  const checkOut = toIsoDate(record["チェックアウト日"]);

  if (!importKey) return null;
  if (!representativeName) return null;
  if (!checkIn || !checkOut) return null;

  return {
    lineNo,
    importKey,
    checkIn,
    checkOut,
    representativeName,
    nameKana: asTextField(record["ふりがな"]) || null,
    groupType: asTextField(record["グループ形態"]) || null,
    groupName: asTextField(record["グループ名"]) || null,
    phone: asPhoneString(record["電話番号"]) || null,
    email: asTextField(record["メールアドレス"]).toLowerCase() || null,
    prefecture: asTextField(record["都道府県"]) || null,
    city: asTextField(record["市区町村"]) || null,
    address: asTextField(record["住所"]) || null,
    guestTotal: normalizeGuestTotalForStorage(asTextField(record["宿泊人数"])),
    adultMale: normalizeGuestBreakdownForStorage(
      asTextField(record["中学生以上男性"])
    ),
    adultFemale: normalizeGuestBreakdownForStorage(
      asTextField(record["中学生以上女性"])
    ),
    boyStudent: normalizeGuestBreakdownForStorage(
      asTextField(record["小学生男の子"])
    ),
    girlStudent: normalizeGuestBreakdownForStorage(
      asTextField(record["小学生女の子"])
    ),
    age3plus: normalizeGuestBreakdownForStorage(
      asTextField(record["3歳以上幼児"])
    ),
    under3: normalizeGuestBreakdownForStorage(
      asTextField(record["3歳未満乳幼児"])
    ),
    arrivalTime: asTextField(record["到着時間"]) || null,
    transport: asTextField(record["交通手段"]) || null,
    meal: asTextField(record["食事"]) || null,
    bbq: asTextField(record["BBQレンタル"]) || null,
    roomNames: parseRoomNames(record["部屋"]),
    internalMemo: asTextField(record["運用メモ"]) || null,
    guestMemo: asTextField(record["宿泊者メモ"]) || null,
  };
}

function parsePastCompanionRows(
  records: Record<string, unknown>[]
): ParsedCompanionRow[] {
  const parsed: ParsedCompanionRow[] = [];

  for (const record of records) {
    const importKey = asTextField(record["取込キー"]);
    const name = asTextField(record["氏名"]);
    if (!importKey || !name) continue;

    const rawEntryNo =
      record["No"] ?? record["連番"] ?? record["entry_no"] ?? "";
    const entryNoParsed = parseInt(String(rawEntryNo), 10);
    const entryNo = Number.isFinite(entryNoParsed)
      ? entryNoParsed
      : parsed.length + 1;

    parsed.push({
      importKey,
      entryNo,
      name,
      nameKana: asTextField(record["ふりがな"]) || null,
      age: asTextField(record["年齢"]) || null,
      gender: asTextField(record["性別"]) || null,
    });
  }

  return parsed;
}

async function loadRoomNameIndex(
  supabase: SupabaseClient
): Promise<Map<string, { room_id: string; room_name: string }>> {
  const { data, error } = await supabase
    .from("rooms")
    .select("room_id, room_name");
  if (error) throw error;

  const index = new Map<string, { room_id: string; room_name: string }>();
  for (const room of data ?? []) {
    const roomName = String(room.room_name ?? "").trim();
    if (!roomName) continue;
    index.set(roomName, {
      room_id: room.room_id,
      room_name: roomName,
    });
  }
  return index;
}

async function loadExistingPastSeqByYear(
  supabase: SupabaseClient
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("reservations")
    .select("reservation_id")
    .like("reservation_id", "PAST-%");
  if (error) throw error;

  const maxByYear = new Map<number, number>();
  for (const row of data ?? []) {
    const match = String(row.reservation_id ?? "").match(PAST_ID_PATTERN);
    if (!match) continue;
    const year = Number(match[1]);
    const seq = Number(match[2]);
    maxByYear.set(year, Math.max(maxByYear.get(year) ?? 0, seq));
  }
  return maxByYear;
}

async function loadExistingRaSeqByYear(
  supabase: SupabaseClient
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("room_assignments")
    .select("room_assignment_id");
  if (error) throw error;

  const maxByYear = new Map<number, number>();
  for (const row of data ?? []) {
    const match = String(row.room_assignment_id ?? "").match(RA_ID_PATTERN);
    if (!match) continue;
    const year = Number(match[1]);
    const seq = Number(match[2]);
    maxByYear.set(year, Math.max(maxByYear.get(year) ?? 0, seq));
  }
  return maxByYear;
}

async function loadExistingDuplicateKeys(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("reservations")
    .select("check_in, representative_name, last_name, first_name, phone")
    .eq("import_source", IMPORT_SOURCE);
  if (error) throw error;

  const keys = new Set<string>();
  for (const row of data ?? []) {
    const name =
      asTextField(row.representative_name) ||
      `${asTextField(row.last_name)}${asTextField(row.first_name)}`;
    if (!name) continue;
    keys.add(
      duplicateKey(
        row.check_in ? String(row.check_in).slice(0, 10) : null,
        name,
        asPhoneString(row.phone) || null
      )
    );
  }
  return keys;
}

function buildReservationInsert(
  row: ParsedReservationRow,
  reservationId: string,
  batchId: string,
  hasRoomAssignments: boolean
): ReservationInsert {
  const checkInDate = parseDateValue(row.checkIn);
  const checkOutDate = parseDateValue(row.checkOut);
  const { lastName, firstName } = splitRepresentativeName(row.representativeName);
  const nowIso = new Date().toISOString();

  return {
    reservation_id: reservationId,
    access_key: generateAccessKey(),
    import_source: IMPORT_SOURCE,
    import_row_id: `past:ledger-${batchId}-${row.lineNo}`,
    request_id: null,
    channel: CHANNEL,
    status: DEFAULTS.status,
    last_name: lastName,
    first_name: firstName,
    representative_name: row.representativeName,
    last_name_kana: null,
    first_name_kana: null,
    name_kana: row.nameKana,
    group_type: row.groupType,
    group_name: row.groupName,
    email: row.email,
    phone: row.phone,
    phone_available: null,
    postal_code: null,
    prefecture: row.prefecture,
    city: row.city,
    address_line: null,
    address: row.address,
    check_in: row.checkIn,
    check_out: row.checkOut,
    nights: calculateNights(checkInDate, checkOutDate),
    guest_total: row.guestTotal,
    adult_male: row.adultMale,
    adult_female: row.adultFemale,
    boy_student: row.boyStudent,
    girl_student: row.girlStudent,
    age_3plus: row.age3plus,
    under_3: row.under3,
    arrival_time: row.arrivalTime,
    transport: row.transport,
    vehicle_count: null,
    meal: row.meal,
    bbq: row.bbq,
    somen: null,
    inquiry: null,
    travel_purpose: null,
    travel_purpose_other: null,
    referral: null,
    referral_other: null,
    last_stay: null,
    assignment_status: hasRoomAssignments ? "割当済" : DEFAULTS.assignmentStatus,
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
    internal_memo: row.internalMemo,
    guest_memo: row.guestMemo,
    gcal_event_id: null,
    is_archived: true,
    sheet_created_at: nowIso,
    sheet_updated_at: nowIso,
    synced_at: nowIso,
  };
}

function nextPastSeq(
  year: number,
  existingMaxByYear: Map<number, number>,
  pendingByYear: Map<number, number>
): number {
  const base = existingMaxByYear.get(year) ?? 0;
  const pending = pendingByYear.get(year) ?? 0;
  const next = Math.max(base, pending) + 1;
  pendingByYear.set(year, next);
  return next;
}

function nextRaSeq(
  year: number,
  existingMaxByYear: Map<number, number>,
  pendingByYear: Map<number, number>
): number {
  const base = existingMaxByYear.get(year) ?? 0;
  const pending = pendingByYear.get(year) ?? 0;
  const next = Math.max(base, pending) + 1;
  pendingByYear.set(year, next);
  return next;
}

export async function importPastLedger(
  supabase: SupabaseClient,
  reservationsPath: string,
  options: PastLedgerImportOptions
): Promise<PastLedgerImportResult> {
  const dryRun = options.dryRun ?? false;
  const batchId = options.batchId;
  const records = csvToRecords(reservationsPath);

  const [
    roomIndex,
    existingPastSeqByYear,
    existingRaSeqByYear,
    existingDuplicateKeys,
  ] = await Promise.all([
    loadRoomNameIndex(supabase),
    loadExistingPastSeqByYear(supabase),
    loadExistingRaSeqByYear(supabase),
    loadExistingDuplicateKeys(supabase),
  ]);

  const reservationRows: ParsedReservationRow[] = [];
  const reservationWarnings: string[] = [];
  let reservationSkipped = 0;

  for (let i = 0; i < records.length; i++) {
    const parsed = parsePastReservationRow(records[i], i + 2);
    if (!parsed) {
      reservationSkipped++;
      continue;
    }
    reservationRows.push(parsed);
  }

  const importKeys = reservationRows.map((row) => row.importKey);
  const duplicateImportKeys = importKeys.filter(
    (key, index) => importKeys.indexOf(key) !== index
  );
  if (duplicateImportKeys.length > 0) {
    throw new Error(
      `取込キーが CSV 内で重複しています: ${[...new Set(duplicateImportKeys)].join(", ")}`
    );
  }

  const pendingPastSeq = new Map<number, number>();
  const pendingRaSeq = new Map<number, number>();
  const importKeyToReservationId = new Map<string, string>();
  const reservationInserts: ReservationInsert[] = [];
  const roomAssignmentInserts: Record<string, unknown>[] = [];
  const duplicateRows: string[] = [];
  const unknownRooms = new Set<string>();
  const preview: PastLedgerImportResult["preview"] = [];

  for (const row of reservationRows) {
    const dupKey = duplicateKey(row.checkIn, row.representativeName, row.phone);
    if (existingDuplicateKeys.has(dupKey)) {
      duplicateRows.push(
        `${row.importKey}: ${row.checkIn} / ${row.representativeName} / ${row.phone ?? "電話なし"}`
      );
      reservationSkipped++;
      continue;
    }

    const year = Number(row.checkIn.slice(0, 4));
    const seq = nextPastSeq(year, existingPastSeqByYear, pendingPastSeq);
    const reservationId = formatPastReservationId(year, seq);
    importKeyToReservationId.set(row.importKey, reservationId);
    existingDuplicateKeys.add(dupKey);

    const hasRoomAssignments = row.roomNames.length > 0;
    reservationInserts.push(
      buildReservationInsert(row, reservationId, batchId, hasRoomAssignments)
    );

    for (const roomName of row.roomNames) {
      const room = roomIndex.get(roomName);
      if (!room) {
        unknownRooms.add(roomName);
        continue;
      }

      const raYear = year;
      const raSeq = nextRaSeq(raYear, existingRaSeqByYear, pendingRaSeq);
      roomAssignmentInserts.push({
        room_assignment_id: formatRoomAssignmentId(raYear, raSeq),
        reservation_id: reservationId,
        room_id: room.room_id,
        room_name: room.room_name,
        stay_start: row.checkIn,
        stay_end: row.checkOut,
        assigned_guest_count: null,
        male_count: null,
        female_count: null,
        child_count: null,
        boy_student_count: null,
        girl_student_count: null,
        age_3plus_count: null,
        under_3_count: null,
        display_memo: null,
        assignment_memo: null,
        is_archived: true,
        synced_at: new Date().toISOString(),
      });
    }

    preview.push({
      importKey: row.importKey,
      reservationId,
      checkIn: row.checkIn,
      name: row.representativeName,
      rooms: row.roomNames,
    });
  }

  if (unknownRooms.size > 0) {
    reservationWarnings.push(
      `未登録の部屋名があります（部屋割はスキップ）: ${[...unknownRooms].join(", ")}`
    );
  }

  let companionRows: ParsedCompanionRow[] = [];
  if (options.companionsPath) {
    companionRows = parsePastCompanionRows(csvToRecords(options.companionsPath));
  }

  const companionInserts: Record<string, unknown>[] = [];
  const orphanCompanionKeys = new Set<string>();
  let companionSkipped = 0;

  for (const row of companionRows) {
    const reservationId = importKeyToReservationId.get(row.importKey);
    if (!reservationId) {
      orphanCompanionKeys.add(row.importKey);
      companionSkipped++;
      continue;
    }

    companionInserts.push({
      reservation_id: reservationId,
      access_key: null,
      entry_no: row.entryNo,
      name: row.name,
      name_kana: row.nameKana,
      age: row.age,
      gender: row.gender,
      source: "過去取込",
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const touchedCompanionReservations = new Set(
    companionInserts.map((row) => String(row.reservation_id))
  );

  if (!dryRun) {
    if (reservationInserts.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < reservationInserts.length; i += chunkSize) {
        const chunk = reservationInserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("reservations").insert(chunk);
        if (error) throw error;
      }
    }

    if (roomAssignmentInserts.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < roomAssignmentInserts.length; i += chunkSize) {
        const chunk = roomAssignmentInserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("room_assignments").insert(chunk);
        if (error) throw error;
      }
    }

    if (companionInserts.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < companionInserts.length; i += chunkSize) {
        const chunk = companionInserts.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("companions")
          .upsert(chunk, { onConflict: "reservation_id,entry_no" });
        if (error) throw error;
      }

      const nowIso = new Date().toISOString();
      await supabase
        .from("reservations")
        .update({ companion_form_answered: true, updated_at: nowIso })
        .in("reservation_id", [...touchedCompanionReservations]);
    }
  }

  return {
    dryRun,
    batchId,
    reservations: {
      imported: reservationInserts.length,
      skipped: reservationSkipped,
      duplicates: duplicateRows,
      warnings: reservationWarnings,
    },
    roomAssignments: {
      imported: roomAssignmentInserts.length,
      skipped: reservationRows.reduce(
        (count, row) => count + row.roomNames.filter((name) => !roomIndex.has(name)).length,
        0
      ),
      unknownRooms: [...unknownRooms],
    },
    companions: {
      imported: companionInserts.length,
      skipped: companionSkipped,
      orphanKeys: [...orphanCompanionKeys],
    },
    preview,
  };
}

export function printPastLedgerImportResult(result: PastLedgerImportResult): void {
  console.log(`batchId: ${result.batchId}`);
  console.log(`mode: ${result.dryRun ? "dry-run" : "execute"}`);
  console.log(
    `reservations: imported=${result.reservations.imported} skipped=${result.reservations.skipped}`
  );
  if (result.reservations.duplicates.length > 0) {
    console.log("duplicates:");
    for (const line of result.reservations.duplicates) console.log(`  ${line}`);
  }
  for (const warning of result.reservations.warnings) {
    console.log(`warning: ${warning}`);
  }
  console.log(
    `room-assignments: imported=${result.roomAssignments.imported} skipped=${result.roomAssignments.skipped}`
  );
  if (result.roomAssignments.unknownRooms.length > 0) {
    console.log(`unknown rooms: ${result.roomAssignments.unknownRooms.join(", ")}`);
  }
  console.log(
    `companions: imported=${result.companions.imported} skipped=${result.companions.skipped}`
  );
  if (result.companions.orphanKeys.length > 0) {
    console.log(`orphan companion keys: ${result.companions.orphanKeys.join(", ")}`);
  }
  if (result.preview.length > 0) {
    console.log("preview:");
    for (const row of result.preview.slice(0, 20)) {
      console.log(
        `  ${row.importKey} -> ${row.reservationId} ${row.checkIn} ${row.name} rooms=[${row.rooms.join(", ")}]`
      );
    }
    if (result.preview.length > 20) {
      console.log(`  ... and ${result.preview.length - 20} more`);
    }
  }
}
