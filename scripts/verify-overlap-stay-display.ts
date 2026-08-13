import assert from "node:assert/strict";
import { groupOverlapStays } from "../lib/utils/overlap-stay-display";

const groups = groupOverlapStays(
  [
    {
      reservation_id: "OUT-1",
      representative_name: "出",
      status: "確定",
      check_in: "2026-08-10",
      check_out: "2026-08-13",
      guest_total: "2",
    },
    {
      reservation_id: "IN-1",
      representative_name: "入",
      status: "確定",
      check_in: "2026-08-13",
      check_out: "2026-08-14",
      guest_total: "2",
    },
    {
      reservation_id: "STAY-1",
      representative_name: "滞",
      status: "確定",
      check_in: "2026-08-12",
      check_out: "2026-08-15",
      guest_total: "2",
    },
  ],
  "2026-08-13"
);

assert.deepEqual(
  groups.map((g) => g.kind),
  ["checkin", "stay", "checkout"]
);
assert.deepEqual(
  groups.map((g) => g.label),
  ["チェックイン", "滞在中", "チェックアウト"]
);

console.log("verify-overlap-stay-display: ok");
