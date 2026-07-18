/**
 * リクエスト誤取込（RQ32〜37）の復旧
 *
 * npx tsx scripts/recover-bad-request-imports.ts
 * npx tsx scripts/recover-bad-request-imports.ts --execute
 */
import { loadEnvLocal } from "./load-env";
import {
  auditRequestRecoveryResidues,
  recoverBadRequestImports,
} from "@/lib/import/recover-bad-request-imports";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  if (execute) {
    console.log("*** 本番復旧モード: DB を変更します ***");
  } else {
    console.log("*** Dry Run: 変更は行いません ***");
  }

  const supabase = createAdminClient();
  const audit = await auditRequestRecoveryResidues(supabase);

  console.log("\n=== 削除対象 ===");
  for (const row of audit.candidates) {
    console.log(
      `  - ${row.request_id} | ${row.last_name} ${row.first_name} | ${row.check_in} | row=${row.import_row_id} | linked=${row.linked_reservation_id} | ${row.reason.join(",")}`
    );
  }

  console.log("\n=== 大﨑（リネーム元） ===");
  console.log(audit.osaki);

  console.log("\n=== 残差チェック（実行前） ===");
  console.log(
    `  reservations→request: ${audit.residues.reservationsPointing}`
  );
  console.log(`  form_import_log: ${audit.residues.formImportLogs}`);
  console.log(`  mail_logs: ${audit.residues.mailLogs}`);
  console.log(`  reservations 2027: ${audit.reservations2027}`);
  console.log(`  composite reservations: ${audit.compositeReservations}`);
  console.log(`  山形すでに存在: ${audit.yamagataExists}`);

  const result = await recoverBadRequestImports(supabase, { dryRun });
  console.log("\n=== 結果 ===");
  console.log(JSON.stringify(result, null, 2));

  if (!dryRun) {
    const after = await auditRequestRecoveryResidues(supabase);
    console.log("\n=== 復旧後残差 ===");
    console.log(`  複合ID候補: ${after.candidates.length}`);
    console.log(
      `  reservations→request: ${after.residues.reservationsPointing}`
    );
    console.log(`  form_import_log(touch): ${after.residues.formImportLogs}`);
    console.log(`  mail_logs: ${after.residues.mailLogs}`);
    console.log(`  reservations 2027: ${after.reservations2027}`);
    console.log(`  composite reservations: ${after.compositeReservations}`);

    const { data: rq32 } = await supabase
      .from("reservation_requests")
      .select("request_id, import_row_id, last_name, first_name, check_in")
      .eq("request_id", "STUDIO-RQ32")
      .maybeSingle();
    const { data: rq33 } = await supabase
      .from("reservation_requests")
      .select("request_id, import_row_id, last_name, first_name, check_in")
      .eq("request_id", "STUDIO-RQ33")
      .maybeSingle();
    const { data: rq38 } = await supabase
      .from("reservation_requests")
      .select("request_id")
      .eq("request_id", "STUDIO-RQ38")
      .maybeSingle();
    const { data: logs } = await supabase
      .from("form_import_log")
      .select("source_row, request_id")
      .eq("source", "request")
      .in("source_row", [13, 18, 48, 49])
      .order("source_row");

    console.log("\n=== 採番揃え確認 ===");
    console.log("RQ32:", rq32);
    console.log("RQ33:", rq33);
    console.log("RQ38残存:", rq38);
    console.log("import_log 13/18/48/49:", logs);
  } else {
    console.log("\n実行するには:");
    console.log("  npx tsx scripts/recover-bad-request-imports.ts --execute");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
