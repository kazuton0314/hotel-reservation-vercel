import { loadEnvLocal } from "./load-env";
import { loadFormCsv } from "@/lib/import/form-csv";
import { isRequestRowImportable } from "@/lib/import/request-mapper";
import { isStudioRowImportable } from "@/lib/import/reservation-mapper";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const supabase = createAdminClient();
  const reqFile = "./data/予約リクエストテストフォーム - シート1.csv";
  const stFile = "./data/本予約テストフォーム - シート1.csv";

  const req = loadFormCsv(reqFile);
  const st = loadFormCsv(stFile);

  const { data: logs } = await supabase
    .from("form_import_log")
    .select("source, source_row, request_id, reservation_id")
    .order("source_row");

  const loggedRequestRows = new Set(
    (logs ?? []).filter((l) => l.source === "request").map((l) => l.source_row)
  );
  const loggedStudioRows = new Set(
    (logs ?? []).filter((l) => l.source === "studio").map((l) => l.source_row)
  );

  console.log("=== CSV ===");
  console.log(
    `リクエスト: ${req.rows.length}行 / 取込可能 ${req.rows.filter((r) => isRequestRowImportable(r, req.headers)).length}行`
  );
  console.log(
    `本予約: ${st.rows.length}行 / 取込可能 ${st.rows.filter((r) => isStudioRowImportable(r, st.headers)).length}行`
  );

  console.log("\n=== form_import_log ===");
  console.log(`リクエスト済み行: ${[...loggedRequestRows].join(", ") || "なし"}`);
  console.log(`本予約済み行: ${[...loggedStudioRows].join(", ") || "なし"}`);

  const { count: requestCount } = await supabase
    .from("reservation_requests")
    .select("*", { count: "exact", head: true });
  const { count: reservationCount } = await supabase
    .from("reservations")
    .select("*", { count: "exact", head: true });

  console.log("\n=== DB件数 ===");
  console.log(`reservation_requests: ${requestCount ?? 0}`);
  console.log(`reservations: ${reservationCount ?? 0}`);

  const { data: testRequests } = await supabase
    .from("reservation_requests")
    .select("request_id, representative_name, check_in, status")
    .ilike("representative_name", "%テスト%")
    .order("check_in", { ascending: true });

  console.log("\n=== テスト系リクエスト ===");
  for (const r of testRequests ?? []) {
    console.log(`  ${r.request_id} ${r.representative_name} ${r.check_in} [${r.status}]`);
  }
  if (!testRequests?.length) console.log("  （なし）");

  const { data: testReservations } = await supabase
    .from("reservations")
    .select("reservation_id, representative_name, check_in, status")
    .ilike("representative_name", "%テスト%")
    .order("check_in", { ascending: true });

  console.log("\n=== テスト系本予約 ===");
  for (const r of testReservations ?? []) {
    console.log(`  ${r.reservation_id} ${r.representative_name} ${r.check_in} [${r.status}]`);
  }
  if (!testReservations?.length) console.log("  （なし）");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
