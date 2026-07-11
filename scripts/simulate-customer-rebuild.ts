import { readFileSync } from "fs";
import {
  buildCustomerKey,
  normalizePhone,
} from "../lib/services/customer-index";

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
      } else if (ch === '"') inQuotes = false;
      else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((c) => c.trim())) rows.push(row);
  }
  return rows;
}

function rowToRecord(headers: string[], row: string[]) {
  return Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]));
}

function normDate(s: string) {
  return s.replace(/\//g, "-").slice(0, 10);
}

function countsAsVisit(status: string, checkIn: string, checkOut: string) {
  if (status === "キャンセル") return false;
  return Boolean(checkIn && checkOut);
}

type Res = {
  reservation_id: string;
  customer_id: string | null;
  representative_name: string | null;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
  is_archived: boolean;
};

function mapReservation(record: Record<string, string>, archived: boolean): Res {
  return {
    reservation_id: record["予約ID"],
    customer_id: record["顧客ID"] || null,
    representative_name: record["代表者名"] || null,
    name_kana: record["ふりがな"] || null,
    email: record["メールアドレス"] || null,
    phone: record["電話番号"] || null,
    check_in: normDate(record["チェックイン日"] || ""),
    check_out: normDate(record["チェックアウト日"] || ""),
    status: record["ステータス"] || "",
    is_archived: archived,
  };
}

const gas = parseCsv(readFileSync("data/09_顧客索引.csv", "utf8"));
const res03 = parseCsv(readFileSync("data/03_予約台帳.csv", "utf8"));
const res07 = parseCsv(readFileSync("data/07_予約台帳_アーカイブ.csv", "utf8"));
const gData = gas.slice(1).map((r) => rowToRecord(gas[0], r));

const rows: Res[] = [
  ...res03.slice(1).map((r) => mapReservation(rowToRecord(res03[0], r), false)),
  ...res07.slice(1).map((r) => mapReservation(rowToRecord(res07[0], r), true)),
];

const keys = new Set<string>();
for (const row of rows) {
  const key = buildCustomerKey(row);
  if (key) keys.add(key);
}

type SimCustomer = {
  customer_id: string;
  customer_key: string;
  visit_count: number;
  last_check_out: string | null;
};

const simulated = new Map<string, SimCustomer>();

for (const key of keys) {
  const sameKey = rows.filter((r) => buildCustomerKey(r) === key);
  const sample =
    sameKey.find((r) => r.customer_id) ??
    sameKey.find((r) => countsAsVisit(r.status, r.check_in ?? "", r.check_out ?? "")) ??
    sameKey[0];

  let visitCount = 0;
  let lastCheckOut: string | null = null;
  for (const r of sameKey) {
    if (!countsAsVisit(r.status, r.check_in ?? "", r.check_out ?? "")) continue;
    visitCount++;
    if (r.check_out && (!lastCheckOut || r.check_out > lastCheckOut)) {
      lastCheckOut = r.check_out;
    }
  }

  const customerId =
    sameKey.find((r) => r.customer_id)?.customer_id ??
    `CK-${key.replace(/[^a-zA-Z0-9|]+/g, "-").slice(0, 40)}`;

  simulated.set(customerId, {
    customer_id: customerId,
    customer_key: key,
    visit_count: visitCount,
    last_check_out: lastCheckOut,
  });
}

const gById = new Map(gData.map((r) => [r["顧客ID"], r]));
const missing = [...gById.keys()].filter((id) => !simulated.has(id));
const extra = [...simulated.keys()].filter((id) => !gById.has(id));

console.log("Simulated customers:", simulated.size, "GAS:", gData.length);
console.log("Missing in simulated:", missing.length);
console.log("Extra in simulated:", extra.length);
if (missing.length) console.log("Missing sample:", missing.slice(0, 10));
if (extra.length) console.log("Extra sample:", extra.slice(0, 10));

let visitMismatch = 0;
const visitDiffs: string[] = [];
for (const [id, g] of gById) {
  const s = simulated.get(id);
  if (!s) continue;
  if (Number(g["来館回数"]) !== s.visit_count) {
    visitMismatch++;
    visitDiffs.push(`${id}: GAS ${g["来館回数"]} vs sim ${s.visit_count}`);
  }
}
console.log("Visit mismatch:", visitMismatch);
if (visitDiffs.length) console.log(visitDiffs.join("\n"));
