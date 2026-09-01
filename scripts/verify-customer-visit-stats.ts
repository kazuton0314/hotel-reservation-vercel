import assert from "node:assert/strict";
import { countsAsVisit } from "../lib/services/customer-index";

function testCountsAsVisit() {
  assert.equal(
    countsAsVisit({ status: "確定", check_in: "2025-01-01", check_out: "2025-01-02" }),
    true
  );
  assert.equal(
    countsAsVisit({ status: "キャンセル", check_in: "2025-01-01", check_out: "2025-01-02" }),
    false
  );
  assert.equal(
    countsAsVisit({ status: "確定", check_in: null, check_out: "2025-01-02" }),
    false
  );
}

function computeVisitStats(
  rows: { status: string; check_in: string | null; check_out: string | null }[]
) {
  let visitCount = 0;
  let lastCheckOut: string | null = null;
  for (const r of rows) {
    if (!countsAsVisit(r)) continue;
    visitCount++;
    if (r.check_out && (!lastCheckOut || r.check_out > lastCheckOut)) {
      lastCheckOut = r.check_out;
    }
  }
  return { visitCount, lastCheckOut };
}

function testMergedVisitCount() {
  const merged = computeVisitStats([
    { status: "確定", check_in: "2024-05-01", check_out: "2024-05-02" },
    { status: "確定", check_in: "2025-08-01", check_out: "2025-08-03" },
    { status: "キャンセル", check_in: "2025-09-01", check_out: "2025-09-02" },
  ]);
  assert.equal(merged.visitCount, 2);
  assert.equal(merged.lastCheckOut, "2025-08-03");
}

testCountsAsVisit();
testMergedVisitCount();
console.log("verify-customer-visit-stats: ok");
