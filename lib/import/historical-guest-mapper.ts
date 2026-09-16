export type HistoricalChargeInsert = {
  category: string;
  label: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  source: "過去帳票";
  sort_order: number;
};

export type HistoricalGuestMappedExtras = {
  representativeAge: number | null;
  representativeGender: string | null;
  guestMemo: string | null;
  charges: HistoricalChargeInsert[];
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number | null {
  const raw = text(value).replace(/[￥¥,円個台人時間%歳]/g, "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function makeCharge(
  category: string,
  label: string | null,
  unitPriceRaw: unknown,
  quantityRaw: unknown,
  subtotalRaw: unknown,
  sortOrder: number
): HistoricalChargeInsert | null {
  let unitPrice = number(unitPriceRaw);
  let quantity = number(quantityRaw);
  let subtotal = number(subtotalRaw);
  if (unitPrice === null && quantity === null && subtotal === null) return null;

  quantity ??= 1;
  if (unitPrice === null && subtotal !== null && quantity > 0) {
    unitPrice = subtotal / quantity;
  }
  unitPrice ??= 0;
  subtotal ??= Math.round(unitPrice * quantity);

  return {
    category,
    label,
    unit_price: unitPrice,
    quantity,
    subtotal,
    source: "過去帳票",
    sort_order: sortOrder,
  };
}

function mergeMemo(guestMemo: unknown, misc: unknown): string | null {
  const parts: string[] = [];
  const memo = text(guestMemo);
  const other = text(misc);
  if (memo) parts.push(memo);
  if (other && other !== memo) parts.push(`その他: ${other}`);
  return parts.length ? parts.join("\n") : null;
}

/** 校正済み宿泊者JSONの追加項目を、予約本体・料金明細へ振り分ける。 */
export function mapHistoricalGuestExtras(
  fields: Record<string, unknown>
): HistoricalGuestMappedExtras {
  const charges: HistoricalChargeInsert[] = [];
  let sortOrder = 1;

  for (let index = 1; index <= 6; index++) {
    const charge = makeCharge(
      "宿泊料金",
      `宿泊料金${index}`,
      fields[`宿泊料金${index}（単価）`],
      fields[`宿泊料金${index}（人数）`],
      fields[`宿泊料金${index}（小計）`],
      sortOrder
    );
    if (charge) {
      charges.push(charge);
      sortOrder++;
    }
  }

  const simpleCharges = [
    ["BBQ料金", "BBQセット", "BBQセット（台数）", "BBQ料金（小計）"],
    ["追加炭料金", "追加炭", "追加炭（個数）", "追加炭料金（小計）"],
    ["体育館料金", "体育館", "体育館（Hour）", "体育館料金（小計）"],
  ] as const;
  for (const [category, label, quantityKey, subtotalKey] of simpleCharges) {
    const quantity = number(fields[quantityKey]);
    const subtotal = number(fields[subtotalKey]);
    const unitPrice = quantity && subtotal !== null ? subtotal / quantity : null;
    const charge = makeCharge(
      category,
      label,
      unitPrice,
      quantity,
      subtotal,
      sortOrder
    );
    if (charge) {
      charges.push(charge);
      sortOrder++;
    }
  }

  for (let index = 1; index <= 2; index++) {
    const rate = number(fields[`キャンセル料金${index}（%）`]);
    const people = number(fields[`キャンセル料金${index}（人数）`]);
    const subtotal = number(fields[`キャンセル料金${index}（小計）`]);
    const unitPrice = people && subtotal !== null ? subtotal / people : null;
    const charge = makeCharge(
      "キャンセル料金",
      rate === null ? `キャンセル料金${index}` : `${rate}%`,
      unitPrice,
      people,
      subtotal,
      sortOrder
    );
    if (charge) {
      charges.push(charge);
      sortOrder++;
    }
  }

  const age = number(fields["代表者年齢"]);
  const rawGender = text(fields["代表者性別"]);
  const gender =
    rawGender === "男"
      ? "男性"
      : rawGender === "女"
        ? "女性"
        : rawGender || null;
  return {
    representativeAge:
      age !== null && Number.isInteger(age) && age <= 120 ? age : null,
    representativeGender: gender,
    guestMemo: mergeMemo(fields["宿泊者メモ"], fields["その他"]),
    charges,
  };
}
