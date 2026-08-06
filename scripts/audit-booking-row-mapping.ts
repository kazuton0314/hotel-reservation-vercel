import { loadEnvLocal } from "./load-env";
import { fetchSheetRows } from "@/lib/sheets/client";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

type DbReservation = {
  reservation_id: string;
  representative_name: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
  import_source: string | null;
  import_row_id: string | null;
};

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function toIsoDate(y: unknown, m: unknown, d: unknown): string | null {
  const yy = String(y ?? "").trim();
  const mm = String(m ?? "").trim();
  const dd = String(d ?? "").trim();
  if (!yy || !mm || !dd) return null;
  return `${yy.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function scoreMatch(
  sheet: {
    nameKey: string;
    email: string;
    phone: string;
    checkIn: string | null;
    checkOut: string | null;
  },
  row: DbReservation & { nameKey: string; emailKey: string; phoneKey: string }
): number {
  let score = 0;
  if (sheet.nameKey && row.nameKey && sheet.nameKey === row.nameKey) score += 5;
  if (sheet.email && row.emailKey && sheet.email === row.emailKey) score += 4;
  if (
    sheet.phone &&
    row.phoneKey &&
    sheet.phone.length >= 10 &&
    row.phoneKey.endsWith(sheet.phone.slice(-10))
  ) {
    score += 3;
  }
  if (sheet.checkIn && row.check_in && sheet.checkIn === row.check_in) score += 4;
  if (sheet.checkOut && row.check_out && sheet.checkOut === row.check_out) score += 2;
  return score;
}

async function main() {
  const supabase = createAdminClient();
  const { headers, rows } = await fetchSheetRows(
    process.env.GOOGLE_BOOKING_FORM_SPREADSHEET_ID!,
    "シート1",
    52
  );

  const iLast = headers.indexOf("姓");
  const iFirst = headers.indexOf("名");
  const iEmail = headers.indexOf("メールアドレス");
  const iPhone = headers.indexOf("電話番号");
  const iCinY = headers.indexOf("チェックイン年");
  const iCinM = headers.indexOf("チェックイン月");
  const iCinD = headers.indexOf("チェックイン日");
  const iCoutY = headers.indexOf("チェックアウト年");
  const iCoutM = headers.indexOf("チェックアウト月");
  const iCoutD = headers.indexOf("チェックアウト日");

  const sheetRows = rows.map((r) => {
    const last = String(r.values[iLast] ?? "").trim();
    const first = String(r.values[iFirst] ?? "").trim();
    const name = `${last} ${first}`.trim();
    return {
      row: r.sheetRow,
      name,
      nameKey: normalizeName(last + first),
      email: String(r.values[iEmail] ?? "").trim().toLowerCase(),
      phone: String(r.values[iPhone] ?? "").replace(/[^\d]/g, ""),
      checkIn: toIsoDate(r.values[iCinY], r.values[iCinM], r.values[iCinD]),
      checkOut: toIsoDate(r.values[iCoutY], r.values[iCoutM], r.values[iCoutD]),
    };
  });

  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, last_name, first_name, email, phone, check_in, check_out, status, import_source, import_row_id"
    )
    .eq("import_source", "STUDIO");
  if (error) throw error;
  const reservations = ((data ?? []) as DbReservation[]).map((r) => ({
    ...r,
    nameKey: normalizeName(`${r.last_name ?? ""}${r.first_name ?? ""}`),
    emailKey: String(r.email ?? "").trim().toLowerCase(),
    phoneKey: String(r.phone ?? "").replace(/[^\d]/g, ""),
  }));

  const out: Array<{
    row: number;
    name: string;
    sheetIn: string | null;
    sheetOut: string | null;
    resId: string;
    mtNo: string;
    status: string;
    dbIn: string | null;
    dbOut: string | null;
    match: string;
  }> = [];

  for (const s of sheetRows) {
    const byRow = reservations.find(
      (r) => String(r.import_row_id ?? "") === String(s.row)
    );
    if (byRow) {
      out.push({
        row: s.row,
        name: s.name,
        sheetIn: s.checkIn,
        sheetOut: s.checkOut,
        resId: byRow.reservation_id,
        mtNo: String(byRow.reservation_id).match(/^STUDIO-MT(\d+)$/)?.[1] ?? "",
        status: byRow.status,
        dbIn: byRow.check_in,
        dbOut: byRow.check_out,
        match: "import_row",
      });
      continue;
    }

    const candidate = reservations
      .map((r) => ({ r, sc: scoreMatch(s, r) }))
      .filter((x) => x.sc >= 9)
      .sort((a, b) => b.sc - a.sc)[0];
    if (candidate) {
      const r = candidate.r;
      out.push({
        row: s.row,
        name: s.name,
        sheetIn: s.checkIn,
        sheetOut: s.checkOut,
        resId: r.reservation_id,
        mtNo: String(r.reservation_id).match(/^STUDIO-MT(\d+)$/)?.[1] ?? "",
        status: r.status,
        dbIn: r.check_in,
        dbOut: r.check_out,
        match: `fuzzy:${candidate.sc}`,
      });
    } else {
      out.push({
        row: s.row,
        name: s.name,
        sheetIn: s.checkIn,
        sheetOut: s.checkOut,
        resId: "",
        mtNo: "",
        status: "",
        dbIn: null,
        dbOut: null,
        match: "NOT_FOUND",
      });
    }
  }

  out.sort((a, b) => a.row - b.row);
  console.log(
    "row\tname\tsheet_check_in\tsheet_check_out\tdb_reservation_id\tmt_no\tstatus\tdb_check_in\tdb_check_out\tmatch"
  );
  for (const x of out) {
    console.log(
      [
        x.row,
        x.name,
        x.sheetIn ?? "",
        x.sheetOut ?? "",
        x.resId,
        x.mtNo,
        x.status,
        x.dbIn ?? "",
        x.dbOut ?? "",
        x.match,
      ].join("\t")
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

