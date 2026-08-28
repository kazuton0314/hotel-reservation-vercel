/**
 * RQ 採番復旧後の整合性監査（読み取り専用）
 */
import { auditRqRecoveryIntegrity } from "@/lib/import/audit-rq-recovery";
import { createAdminClient } from "@/lib/supabase/server";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

async function main() {
  const supabase = createAdminClient();
  const report = await auditRqRecoveryIntegrity(supabase);

  console.log(report.ok ? "=== 監査 OK ===" : "=== 監査 NG ===");
  console.log("\n--- 統計 ---");
  console.log(JSON.stringify(report.stats, null, 2));

  if (report.samples.konoMizuki.length) {
    console.log("\n--- 鴻野 美月 ---");
    for (const k of report.samples.konoMizuki) {
      console.log(
        `  ${k.requestId} row=${k.importRowId} linked=${k.linkedReservationId ?? "—"}`
      );
    }
  }

  if (report.samples.kawaiReiji) {
    const k = report.samples.kawaiReiji;
    console.log("\n--- 河合 怜治 ---");
    console.log(
      `  ${k.requestId} row=${k.importRowId} linked=${k.linkedReservationId ?? "—"} reservation.request_id=${k.reservationRequestId ?? "—"}`
    );
  }

  console.log("\n--- RQ59–68（シフト範囲）---");
  for (const row of report.samples.shiftedRange59to68) {
    const linkOk =
      row.linkedReservationId && row.reservationId
        ? row.linkedReservationId === row.reservationId
          ? "link-ok"
          : "link-mismatch"
        : row.reservationId
          ? "res-only"
          : row.linkedReservationId
            ? "req-linked-only"
            : "no-booking";
    console.log(
      `  ${row.requestId} ${row.name} row=${row.importRowId} MT=${row.reservationId ?? "—"} [${linkOk}]`
    );
  }

  if (report.issues.length) {
    console.log("\n--- 指摘 ---");
    for (const issue of report.issues) {
      console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
      if (issue.detail) console.log(`    ${issue.detail}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
