/**
 * 本予約フォーム取込の取りこぼしを対象者限定で補正する。
 *
 * - Dry run: npx tsx scripts/recover-targeted-studio-imports.ts
 * - Execute: npx tsx scripts/recover-targeted-studio-imports.ts --execute
 */
import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import { FORM_SOURCES } from "@/lib/config/forms";
import { fetchSheetRows, type SheetRow } from "@/lib/sheets/client";
import { mapStudioFormRow } from "@/lib/import/reservation-mapper";
import { importStudioFormRows } from "@/lib/import/sync-forms";
import { bookingEntryMatchesForLink } from "@/lib/import/match-utils";
import { upsertCustomerFromReservation } from "@/lib/services/customer-index";

loadEnvLocal();

type ReservationRow = {
  reservation_id: string;
  import_source: string | null;
  import_row_id: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  last_name: string | null;
  first_name: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
};

const TARGET_NAMES = [
  "藤井 健人",
  "鴇田 樹",
  "山形 哲也",
  "勝田 智哉",
  "Timothy Bewer",
  "松本 倫幸",
  "大田 千晶",
  "川辺 兼三",
  "田中 一輝",
  "坂東 良晃",
  "FU CHENG",
  "佐々木 愛真",
  "砂川 良太",
  "後藤 泰斗",
] as const;

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function toLabel(row: SheetRow): string {
  return `row=${row.sheetRow}`;
}

async function loadBookingRowsByTargetNames() {
  const cfg = FORM_SOURCES.booking;
  const { headers, rows } = await fetchSheetRows(
    cfg.spreadsheetId,
    cfg.sheetName,
    cfg.dataColumnCount
  );
  const idxLast = headers.findIndex((h) => h === "姓");
  const idxFirst = headers.findIndex((h) => h === "名");
  const byName = new Map<string, SheetRow>();
  for (const row of rows) {
    const key = normalizeName(
      `${String(row.values[idxLast] ?? "").trim()}${String(
        row.values[idxFirst] ?? ""
      ).trim()}`
    );
    if (key) byName.set(key, row);
  }

  const targets: SheetRow[] = [];
  for (const name of TARGET_NAMES) {
    const row = byName.get(normalizeName(name));
    if (row) targets.push(row);
  }
  return { headers, targets };
}

function matchExactIdentity(
  rows: ReservationRow[],
  incoming: ReturnType<typeof mapStudioFormRow>
) {
  return rows.find((r) => {
    if (r.status === "キャンセル") return false;
    if (r.check_in !== incoming.check_in) return false;
    if (
      !bookingEntryMatchesForLink(
        {
          last_name: r.last_name,
          first_name: r.first_name,
          email: r.email,
          phone: r.phone,
          check_in: r.check_in,
        },
        {
          last_name: incoming.last_name,
          first_name: incoming.first_name,
          email: incoming.email,
          phone: incoming.phone,
          check_in: incoming.check_in,
        }
      )
    ) {
      return false;
    }
    if (r.check_out && incoming.check_out && r.check_out !== incoming.check_out) {
      return false;
    }
    return true;
  });
}

async function run() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();
  const now = new Date();

  const { headers, targets } = await loadBookingRowsByTargetNames();
  const targetRowNumbers = targets.map((r) => r.sheetRow).sort((a, b) => a - b);
  console.log(`対象行: ${targetRowNumbers.join(", ")}`);

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, import_source, import_row_id, status, check_in, check_out, last_name, first_name, representative_name, email, phone"
    );
  if (error) throw error;
  const all = (reservations ?? []) as ReservationRow[];

  console.log("\n=== Dry-run plan ===");
  for (const row of targets) {
    const mapped = mapStudioFormRow(row, headers, `DRAFT-${row.sheetRow}`, now, {
      validateBookingHorizon: false,
    });
    const byStudioRow = all.find(
      (r) =>
        String(r.import_source ?? "").trim() === "STUDIO" &&
        String(r.import_row_id ?? "") === String(row.sheetRow)
    );
    if (byStudioRow) {
      console.log(
        `${toLabel(row)} ${mapped.representative_name} -> SKIP (already STUDIO row: ${byStudioRow.reservation_id})`
      );
      continue;
    }
    const provisional = all.find(
      (r) =>
        r.status === "仮予約" &&
        bookingEntryMatchesForLink(
          {
            last_name: r.last_name,
            first_name: r.first_name,
            email: r.email,
            phone: r.phone,
            check_in: r.check_in,
          },
          {
            last_name: mapped.last_name,
            first_name: mapped.first_name,
            email: mapped.email,
            phone: mapped.phone,
            check_in: mapped.check_in,
          }
        )
    );
    if (provisional) {
      console.log(
        `${toLabel(row)} ${mapped.representative_name} -> PROMOTE provisional ${provisional.reservation_id}`
      );
      continue;
    }
    const duplicate = matchExactIdentity(all, mapped);
    if (duplicate) {
      console.log(
        `${toLabel(row)} ${mapped.representative_name} -> MERGE confirmed ${duplicate.reservation_id}`
      );
      continue;
    }
    console.log(`${toLabel(row)} ${mapped.representative_name} -> CREATE new STUDIO-MT`);
  }

  if (!execute) {
    console.log("\nDry run only. 実行するには --execute");
    return;
  }

  console.log("\n=== Execute importStudioFormRows(force=true, targets only) ===");
  const result = await importStudioFormRows(supabase, headers, targets, {
    force: true,
  });
  console.log(JSON.stringify(result, null, 2));

  const namesLike = TARGET_NAMES.map((n) =>
    `representative_name.ilike.%${n.replace(" ", "%")}%`
  ).join(",");
  const { data: updatedReservations, error: updatedError } = await supabase
    .from("reservations")
    .select(
      "reservation_id, customer_id, representative_name, name_kana, email, phone, check_in, check_out, status, is_archived"
    )
    .or(namesLike);
  if (updatedError) throw updatedError;

  let rebuiltCustomers = 0;
  for (const r of updatedReservations ?? []) {
    const customerId = await upsertCustomerFromReservation(supabase, r);
    if (customerId) rebuiltCustomers++;
  }
  console.log(`customer upsert executed for ${rebuiltCustomers} reservations`);

  const { data: afterRows, error: afterError } = await supabase
    .from("reservations")
    .select(
      "reservation_id, import_source, import_row_id, status, check_in, check_out, representative_name, customer_id"
    )
    .or(namesLike)
    .order("check_in", { ascending: true });
  if (afterError) throw afterError;

  console.log("\n=== After snapshot (targets) ===");
  for (const r of afterRows ?? []) {
    console.log(
      [
        r.representative_name,
        r.reservation_id,
        r.status,
        r.check_in,
        r.check_out,
        r.import_source,
        r.import_row_id,
        r.customer_id ?? "",
      ].join("\t")
    );
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

