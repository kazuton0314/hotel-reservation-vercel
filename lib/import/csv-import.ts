import { readFileSync } from "fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncSequencesFromLedger } from "@/lib/import/id-generation";
import { mapLedgerCsvRow, type ReservationInsert } from "@/lib/import/reservation-mapper";
import { mapRequestCsvRow } from "@/lib/import/request-mapper";
import { getCell, headerIndex, rowToRecord } from "@/lib/import/parsers";

export type CsvImportTarget =
  | "reservations-active"
  | "reservations-archive"
  | "requests-active"
  | "requests-archive"
  | "room-assignments-active"
  | "room-assignments-archive";

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }

  return rows;
}

function csvToRecords(filePath: string): Record<string, unknown>[] {
  const raw = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];

  const headers = table[0].map((h) => h.trim());
  return table.slice(1).map((values) => rowToRecord(headers, values));
}

export async function importCsvFile(
  supabase: SupabaseClient,
  target: CsvImportTarget,
  filePath: string
): Promise<{ imported: number; skipped: number }> {
  const records = csvToRecords(filePath);
  let imported = 0;
  let skipped = 0;

  if (target === "reservations-active" || target === "reservations-archive") {
    const isArchived = target === "reservations-archive";
    const batch: ReservationInsert[] = [];

    for (const record of records) {
      const mapped = mapLedgerCsvRow(record, isArchived);
      if (!mapped) {
        skipped++;
        continue;
      }
      batch.push(mapped);
    }

    const chunkSize = 100;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("reservations")
        .upsert(chunk, { onConflict: "reservation_id" });
      if (error) throw error;
      imported += chunk.length;
    }

    await syncSequencesFromLedger(supabase);
    return { imported, skipped };
  }

  if (target === "requests-active" || target === "requests-archive") {
    const isArchived = target === "requests-archive";
    const batch: NonNullable<ReturnType<typeof mapRequestCsvRow>>[] = [];

    for (const record of records) {
      const mapped = mapRequestCsvRow(record, isArchived);
      if (!mapped) {
        skipped++;
        continue;
      }
      batch.push(mapped);
    }

    const chunkSize = 100;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("reservation_requests")
        .upsert(chunk, { onConflict: "request_id" });
      if (error) throw error;
      imported += chunk.length;
    }

    await syncSequencesFromLedger(supabase);
    return { imported, skipped };
  }

  // 04_部屋割り
  const isArchived = target === "room-assignments-archive";
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const idx = headerIndex(headers);
  const batch: Record<string, unknown>[] = [];

  for (const record of records) {
    const values = headers.map((h) => record[h]);
    const id = String(getCell(values, idx, "部屋割りID") ?? "").trim();
    if (!id) {
      skipped++;
      continue;
    }

    const toDate = (v: unknown) => {
      const s = String(v ?? "").trim();
      return s ? s.slice(0, 10) : null;
    };
    const toInt = (v: unknown) => {
      const n = parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) ? n : null;
    };

    batch.push({
      room_assignment_id: id,
      reservation_id: String(getCell(values, idx, "予約ID") ?? "").trim(),
      room_id: String(getCell(values, idx, "部屋ID") ?? "").trim() || null,
      room_name: String(getCell(values, idx, "部屋名") ?? "").trim() || null,
      stay_start: toDate(getCell(values, idx, "利用開始日")),
      stay_end: toDate(getCell(values, idx, "利用終了日")),
      assigned_guest_count: toInt(getCell(values, idx, "割当人数")),
      male_count: toInt(getCell(values, idx, "男性人数")),
      female_count: toInt(getCell(values, idx, "女性人数")),
      child_count: toInt(getCell(values, idx, "子ども人数")),
      boy_student_count: toInt(getCell(values, idx, "小学生男")),
      girl_student_count: toInt(getCell(values, idx, "小学生女")),
      age_3plus_count: toInt(getCell(values, idx, "3歳以上")),
      under_3_count: toInt(getCell(values, idx, "3歳未満")),
      display_memo: String(getCell(values, idx, "表示用メモ") ?? "").trim() || null,
      assignment_memo: String(getCell(values, idx, "部屋割りメモ") ?? "").trim() || null,
      is_archived: isArchived,
      synced_at: new Date().toISOString(),
    });
  }

  const chunkSize = 100;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("room_assignments")
      .upsert(chunk, { onConflict: "room_assignment_id" });
    if (error) throw error;
    imported += chunk.length;
  }

  return { imported, skipped };
}
