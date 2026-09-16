import assert from "node:assert/strict";
import { mapHistoricalGuestExtras } from "../lib/import/historical-guest-mapper";

const mapped = mapHistoricalGuestExtras({
  代表者年齢: "42",
  代表者性別: "男性",
  宿泊者メモ: "手書きメモ",
  その他: "割引あり",
  "宿泊料金1（単価）": "3,000円",
  "宿泊料金1（人数）": "2人",
  "宿泊料金1（小計）": "6,000円",
  "BBQセット（台数）": "2台",
  "BBQ料金（小計）": "4,000円",
  "キャンセル料金1（%）": "20%",
  "キャンセル料金1（人数）": "1人",
  "キャンセル料金1（小計）": "1,000円",
});

assert.equal(mapped.representativeAge, 42);
assert.equal(mapped.representativeGender, "男性");
assert.equal(mapped.guestMemo, "手書きメモ\nその他: 割引あり");
assert.equal(mapped.charges.length, 3);
assert.deepEqual(mapped.charges[0], {
  category: "宿泊料金",
  label: "宿泊料金1",
  unit_price: 3000,
  quantity: 2,
  subtotal: 6000,
  source: "過去帳票",
  sort_order: 1,
});
assert.equal(mapped.charges[1]?.category, "BBQ料金");
assert.equal(mapped.charges[1]?.unit_price, 2000);
assert.equal(mapped.charges[2]?.label, "20%");
assert.equal(mapped.charges[2]?.subtotal, 1000);

console.log("historical guest mapper: OK");
