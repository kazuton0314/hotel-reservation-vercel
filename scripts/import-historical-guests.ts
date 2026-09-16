import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import { finishImportJobRun, startImportJobRun } from "@/lib/ops/job-runs";
import { rebuildAllCustomers } from "@/lib/services/customer-index";
import {
  findExistingHistoricalReservations,
  mapHistoricalGuestRecord,
  type HistoricalImportItem,
} from "@/lib/import/historical-guest-import";

loadEnvLocal();

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function checked(errorLike: PromiseLike<{ error: unknown }>) {
  const { error } = await errorLike;
  if (error) throw error;
}

async function main() {
  const year = arg("--year", process.argv[2]);
  const execute = process.argv.includes("--execute") || process.argv.includes("execute");
  const extractorRoot = path.resolve(arg("--extractor-root", path.join(process.cwd(), "..", "hotel-guest-form-extract"))!);
  if (!year || !/^\d{4}$/.test(year)) throw new Error("--year YYYY を指定してください");
  const recordsDir = path.join(extractorRoot, "output", "records", year);
  const files = (await readdir(recordsDir)).filter((name) => name.endsWith(".json")).sort();
  const items: HistoricalImportItem[] = [];
  for (const file of files) {
    const record = JSON.parse(await readFile(path.join(recordsDir, file), "utf8"));
    items.push(mapHistoricalGuestRecord(record));
  }
  const duplicateKeys = items.filter((item, index) => items.findIndex((other) => other.importRowId === item.importRowId) !== index);
  if (duplicateKeys.length) throw new Error("source.sha256が重複しています");

  const supabase = createAdminClient();
  const existing = await findExistingHistoricalReservations(supabase, year);
  const sourceIds = new Set(items.map((item) => item.importRowId));
  const stale = existing.filter((row) => !sourceIds.has(String(row.import_row_id ?? "")));
  const warnings = items.flatMap((item) => item.warnings.map((warning) => `${item.importKey}: ${warning}`));
  const summary = {
    mode: execute ? "execute" : "dry-run",
    year,
    sourceRecords: items.length,
    reservations: items.length,
    companions: items.reduce((sum, item) => sum + item.companions.length, 0),
    roomAssignments: items.reduce((sum, item) => sum + item.rooms.length, 0),
    charges: items.reduce((sum, item) => sum + item.charges.length, 0),
    existingHistoricalReservations: existing.length,
    staleHistoricalReservations: stale.map((row) => row.reservation_id),
    warnings,
  };
  const previewDir = path.join(extractorRoot, "output", "import-previews");
  await mkdir(previewDir, { recursive: true });
  const previewPath = path.join(previewDir, `historical-${year}-${execute ? "executed" : "dry-run"}.json`);
  await writeFile(previewPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ...summary, previewPath }, null, 2));
  if (!execute) return;
  if (warnings.length) throw new Error("警告があるため実行を中止しました。ドライラン結果を確認してください");
  if (stale.length) throw new Error("DBに入力元から消えた過去予約があります。自動削除せず中止しました");

  const runId = await startImportJobRun(supabase, "import-historical-guests", year);
  try {
    for (const chunk of chunks(items.map((item) => item.reservation), 50)) {
      await checked(supabase.from("reservations").upsert(chunk, { onConflict: "reservation_id" }));
    }
    for (const item of items) {
      await checked(supabase.from("companions").delete().eq("reservation_id", item.reservationId));
      await checked(supabase.from("room_assignments").delete().eq("reservation_id", item.reservationId));
      await checked(supabase.from("reservation_charges").delete().eq("reservation_id", item.reservationId));
      if (item.companions.length) await checked(supabase.from("companions").insert(item.companions));
      if (item.rooms.length) await checked(supabase.from("room_assignments").insert(item.rooms));
      if (item.charges.length) {
        await checked(supabase.from("reservation_charges").insert(item.charges.map((charge) => ({ ...charge, reservation_id: item.reservationId }))));
      }
    }
    await rebuildAllCustomers(supabase);
    await finishImportJobRun(supabase, runId, { status: "success", details: summary });
  } catch (error) {
    await finishImportJobRun(supabase, runId, { status: "error", errorMessage: error instanceof Error ? error.message : String(error), details: summary });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
