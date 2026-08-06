/**
 * 本予約フォーム row48-56 を STUDIO-MT172..180 の連番へ並べ替える。
 * （既存IDを同じ集合内で置換。参照テーブルも追従）
 *
 * Dry run: npx tsx scripts/renumber-studio-rows-48-56-sequential.ts
 * Execute: npx tsx scripts/renumber-studio-rows-48-56-sequential.ts --execute
 */
import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

type Reservation = Record<string, unknown> & {
  reservation_id: string;
  import_row_id: string | null;
  import_source: string | null;
  representative_name: string | null;
  check_in: string | null;
};

const START_ROW = 48;
const END_ROW = 56;
const START_MT = 172;

function expectedIdForRow(row: number): string {
  return `STUDIO-MT${START_MT + (row - START_ROW)}`;
}

async function run() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("import_source", "STUDIO")
    .gte("import_row_id", String(START_ROW))
    .lte("import_row_id", String(END_ROW));
  if (error) throw error;

  const rows = (data ?? []) as Reservation[];
  const targets = rows
    .filter((r) => {
      const n = Number(r.import_row_id);
      return Number.isFinite(n) && n >= START_ROW && n <= END_ROW;
    })
    .sort((a, b) => Number(a.import_row_id) - Number(b.import_row_id));

  if (targets.length !== END_ROW - START_ROW + 1) {
    throw new Error(
      `対象行不足: expected=${END_ROW - START_ROW + 1}, actual=${targets.length}`
    );
  }

  const remap = targets.map((r) => ({
    row: Number(r.import_row_id),
    name: r.representative_name ?? "",
    oldId: r.reservation_id,
    newId: expectedIdForRow(Number(r.import_row_id)),
  }));

  console.log("row\tname\toldId\tnewId\tchange");
  for (const r of remap) {
    console.log(
      [r.row, r.name, r.oldId, r.newId, r.oldId === r.newId ? "keep" : "rename"].join(
        "\t"
      )
    );
  }

  const toRename = remap.filter((r) => r.oldId !== r.newId);
  if (!toRename.length) {
    console.log("\n既に連番整列済み。変更不要。");
    return;
  }
  if (!execute) {
    console.log("\nDry run only. 実行するには --execute");
    return;
  }

  const now = new Date().toISOString();
  const tempPrefix = "__TMP_RENUM__";
  const temps = toRename.map((r) => ({
    ...r,
    tmpId: `${tempPrefix}${r.oldId}`,
  }));

  // Phase 1: old -> temp
  for (const t of temps) {
    const oldRow = targets.find((x) => x.reservation_id === t.oldId);
    if (!oldRow) throw new Error(`old row missing: ${t.oldId}`);

    const { error: insErr } = await supabase
      .from("reservations")
      .insert({ ...oldRow, reservation_id: t.tmpId, updated_at: now });
    if (insErr) throw insErr;

    const updateRef = async (table: string, column: string, value: string) => {
      const { error: e } = await supabase
        .from(table)
        .update({ [column]: value, updated_at: now })
        .eq(column, t.oldId);
      if (e) throw e;
    };

    await updateRef("room_assignments", "reservation_id", t.tmpId);
    await updateRef("companions", "reservation_id", t.tmpId);
    await updateRef("reservation_requests", "linked_reservation_id", t.tmpId);

    const { error: logErr } = await supabase
      .from("form_import_log")
      .update({ reservation_id: t.tmpId, imported_at: now })
      .eq("reservation_id", t.oldId)
      .eq("source", "studio");
    if (logErr) throw logErr;

    const { error: mailErr } = await supabase
      .from("mail_logs")
      .update({ entity_id: t.tmpId })
      .eq("entity_type", "reservation")
      .eq("entity_id", t.oldId);
    if (mailErr) {
      console.warn(`warn: mail_logs update failed for ${t.oldId}: ${mailErr.message}`);
    }

    const { error: delErr } = await supabase
      .from("reservations")
      .delete()
      .eq("reservation_id", t.oldId);
    if (delErr) throw delErr;
  }

  // Phase 2: temp -> final new ID
  for (const t of temps) {
    const { data: tmpRow, error: fetchErr } = await supabase
      .from("reservations")
      .select("*")
      .eq("reservation_id", t.tmpId)
      .single();
    if (fetchErr) throw fetchErr;

    const { error: insErr } = await supabase
      .from("reservations")
      .insert({ ...(tmpRow as Record<string, unknown>), reservation_id: t.newId, updated_at: now });
    if (insErr) throw insErr;

    const updateRef = async (table: string, column: string, value: string) => {
      const { error: e } = await supabase
        .from(table)
        .update({ [column]: value, updated_at: now })
        .eq(column, t.tmpId);
      if (e) throw e;
    };

    await updateRef("room_assignments", "reservation_id", t.newId);
    await updateRef("companions", "reservation_id", t.newId);
    await updateRef("reservation_requests", "linked_reservation_id", t.newId);

    const { error: logErr } = await supabase
      .from("form_import_log")
      .update({ reservation_id: t.newId, imported_at: now })
      .eq("reservation_id", t.tmpId)
      .eq("source", "studio");
    if (logErr) throw logErr;

    const { error: mailErr } = await supabase
      .from("mail_logs")
      .update({ entity_id: t.newId })
      .eq("entity_type", "reservation")
      .eq("entity_id", t.tmpId);
    if (mailErr) {
      console.warn(`warn: mail_logs update failed for ${t.tmpId}: ${mailErr.message}`);
    }

    const { error: delErr } = await supabase
      .from("reservations")
      .delete()
      .eq("reservation_id", t.tmpId);
    if (delErr) throw delErr;
  }

  const { data: verify, error: vErr } = await supabase
    .from("reservations")
    .select("reservation_id, import_row_id, representative_name")
    .eq("import_source", "STUDIO")
    .gte("import_row_id", String(START_ROW))
    .lte("import_row_id", String(END_ROW))
    .order("import_row_id", { ascending: true });
  if (vErr) throw vErr;

  console.log("\nAfter:");
  for (const r of verify ?? []) {
    console.log(`${r.import_row_id}\t${r.representative_name}\t${r.reservation_id}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

