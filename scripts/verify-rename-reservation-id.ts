/**
 * 予約IDリネームのバリデーション検証（本番データは変更しない）
 */
import assert from "node:assert/strict";
import { loadEnvLocal } from "./load-env";
loadEnvLocal();
import { createAdminClient } from "@/lib/supabase/server";
import {
  countReservationIdReferences,
  renameReservationId,
} from "@/lib/services/rename-reservation-id";

async function main() {
  const supabase = createAdminClient();

  await assert.rejects(
    () => renameReservationId(supabase, { fromId: "", toId: "STUDIO-MT99999" }),
    /変更元/
  );
  await assert.rejects(
    () =>
      renameReservationId(supabase, {
        fromId: "STUDIO-MT99999",
        toId: "STUDIO-MT99998",
      }),
    /見つかりません/
  );

  const { data: sample } = await supabase
    .from("reservations")
    .select("reservation_id")
    .like("reservation_id", "STUDIO-MT%")
    .limit(2);
  assert.ok(sample && sample.length >= 2, "need at least 2 STUDIO-MT rows");

  const a = String(sample[0]!.reservation_id);
  const b = String(sample[1]!.reservation_id);

  await assert.rejects(
    () => renameReservationId(supabase, { fromId: a, toId: a }),
    /同じ/
  );
  await assert.rejects(
    () => renameReservationId(supabase, { fromId: a, toId: b }),
    /既に存在/
  );

  const refs = await countReservationIdReferences(supabase, a);
  assert.equal(typeof refs.roomAssignments, "number");
  assert.equal(typeof refs.companions, "number");
  assert.equal(typeof refs.linkedRequests, "number");
  assert.equal(typeof refs.formImportLogs, "number");
  assert.equal(typeof refs.mailLogs, "number");

  console.log("verify-rename-reservation-id: ok");
  console.log(`sample ${a} refs:`, refs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
