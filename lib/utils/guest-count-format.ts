type GuestSource = {
  guest_total?: string | null;
  adult_male?: string | null;
  adult_female?: string | null;
  boy_student?: string | null;
  girl_student?: string | null;
  age_3plus?: string | null;
  under_3?: string | null;
};

function guestFieldText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** 全角数字を半角に揃える */
export function normalizeGuestCountDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );
}

/**
 * 「人数として確定」できるか。
 * 半角/全角数字と「人」「名」のみなら確定（例: 10 / 10人 / １０名 / 3人名）。
 * ～・範囲・その他テキストを含む場合は不定。
 */
export function isDefiniteGuestTotal(value: string | null | undefined): boolean {
  return classifyGuestTotal(value).kind === "definite";
}

/**
 * 保存用分類。
 * - definite: 半角数字のみ（"１０人名" → "10"）
 * - indefinite: 原文 trim（～・範囲・文言あり）
 * - empty: null
 */
export function classifyGuestTotal(value: string | null | undefined): {
  kind: "empty" | "definite" | "indefinite";
  stored: string | null;
} {
  const raw = guestFieldText(value);
  if (!raw) return { kind: "empty", stored: null };

  const digitsNorm = normalizeGuestCountDigits(raw);
  const stripped = digitsNorm.replace(/[\s　]/g, "").replace(/[人名]/g, "");
  if (/^\d+$/.test(stripped)) {
    return { kind: "definite", stored: stripped };
  }
  return { kind: "indefinite", stored: raw };
}

/** DB保存用。確定なら半角数字、不定なら原文、空なら null */
export function normalizeGuestTotalForStorage(
  value: string | null | undefined
): string | null {
  return classifyGuestTotal(value).stored;
}

/** 内訳フィールド（男/女など）: 数字のみなら半角化、それ以外は原文 */
export function normalizeGuestBreakdownForStorage(
  value: string | null | undefined
): string | null {
  const raw = guestFieldText(value);
  if (!raw) return null;
  const digitsNorm = normalizeGuestCountDigits(raw).replace(/[\s　]/g, "");
  if (/^\d+$/.test(digitsNorm)) return digitsNorm;
  return raw;
}

function breakdownFieldIsDefinite(value: unknown): boolean {
  const raw = guestFieldText(value);
  if (!raw) return true;
  return /^\d+$/.test(normalizeGuestCountDigits(raw).replace(/[\s　]/g, ""));
}

function breakdownSum(source: GuestSource): number {
  const fields = [
    source.adult_male,
    source.adult_female,
    source.boy_student,
    source.girl_student,
    source.age_3plus,
    source.under_3,
  ];
  return fields.reduce((sum, field) => {
    const normalized = normalizeGuestBreakdownForStorage(
      field == null ? null : String(field)
    );
    if (!normalized || !/^\d+$/.test(normalized)) return sum;
    return sum + Number(normalized);
  }, 0);
}

/** 3歳未満を除いた内訳合計（空欄は0） */
export function breakdownSumExcludingUnder3(source: GuestSource): number {
  const fields = [
    source.adult_male,
    source.adult_female,
    source.boy_student,
    source.girl_student,
    source.age_3plus,
  ];
  return fields.reduce((sum, field) => {
    const normalized = normalizeGuestBreakdownForStorage(
      field == null ? null : String(field)
    );
    if (!normalized || !/^\d+$/.test(normalized)) return sum;
    return sum + Number(normalized);
  }, 0);
}

/** 一覧の「人数不定」絞り込み用 */
export function hasIndefiniteGuestCount(source: GuestSource): boolean {
  const breakdownFields = [
    source.adult_male,
    source.adult_female,
    source.boy_student,
    source.girl_student,
    source.age_3plus,
    source.under_3,
  ];

  if (breakdownFields.some((field) => !breakdownFieldIsDefinite(field))) {
    return true;
  }

  const classified = classifyGuestTotal(source.guest_total);
  if (classified.kind === "empty") {
    return breakdownSum(source) === 0;
  }
  return classified.kind === "indefinite";
}

/**
 * 宿泊人数が確定数字で、3歳未満を除いた内訳合計と一致しない。
 * （人数不定のグループは対象外。不一致絞り込み用）
 */
export function hasMismatchedGuestCount(source: GuestSource): boolean {
  const classified = classifyGuestTotal(source.guest_total);
  if (classified.kind !== "definite" || !classified.stored) return false;

  const comparedFields = [
    source.adult_male,
    source.adult_female,
    source.boy_student,
    source.girl_student,
    source.age_3plus,
  ];
  // 内訳に不定テキストがある場合は不一致判定しない（不定側で拾う）
  if (comparedFields.some((field) => !breakdownFieldIsDefinite(field))) {
    return false;
  }

  return Number(classified.stored) !== breakdownSumExcludingUnder3(source);
}

/** 集計用: 確定人数のみ数値化。不定・空は null */
export function parseDefiniteGuestTotal(
  value: string | null | undefined
): number | null {
  const classified = classifyGuestTotal(value);
  if (classified.kind !== "definite" || !classified.stored) return null;
  return Number(classified.stored);
}
