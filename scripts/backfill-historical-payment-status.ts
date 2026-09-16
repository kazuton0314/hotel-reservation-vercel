import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/server";
import { evaluateHistoricalLodgingPayment } from "@/lib/import/historical-guest-mapper";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const year = arg("--year", process.argv[2]);
  const execute = process.argv.includes("--execute");
  const extractorRoot = path.resolve(arg("--extractor-root", path.join(process.cwd(), "..", "hotel-guest-form-extract"))!);
  if (!year || !/^\d{4}$/.test(year)) throw new Error("--year YYYY を指定してください");
  const recordsDir = path.join(extractorRoot, "output", "records", year);
  const updates: { importRowId: string; importKey: string; paymentStatus: "完了" | "未払い"; issues: string[] }[] = [];
  for (const file of (await readdir(recordsDir)).filter((name) => name.endsWith(".json")).sort()) {
    const record = JSON.parse(await readFile(path.join(recordsDir, file), "utf8"));
    const sha256 = String(record.source?.sha256 ?? "").trim();
    if (!sha256) throw new Error(`${file}: source.sha256がありません`);
    const evaluation = evaluateHistoricalLodgingPayment(record.fields ?? {});
    updates.push({
      importRowId: `sha256:${sha256}`,
      importKey: String(record.import_key ?? file),
      paymentStatus: evaluation.complete ? "完了" : "未払い",
      issues: evaluation.issues,
    });
  }
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    year,
    total: updates.length,
    completed: updates.filter((item) => item.paymentStatus === "完了").length,
    unpaid: updates.filter((item) => item.paymentStatus === "未払い").map((item) => ({ importKey: item.importKey, issues: item.issues })),
  }, null, 2));
  if (!execute) return;
  const supabase = createAdminClient();
  for (const item of updates) {
    const { error } = await supabase
      .from("reservations")
      .update({ payment_status: item.paymentStatus, updated_at: new Date().toISOString() })
      .eq("import_source", "過去取込")
      .eq("import_row_id", item.importRowId);
    if (error) throw error;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
