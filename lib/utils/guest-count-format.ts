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
 * フォーム取り込みで「人数として確定」とみなす guest_total。
 * 例: 10 / 10人 / １０ / １０人（「10名」は不定扱い）
 */
export function isDefiniteGuestTotal(value: string | null | undefined): boolean {
  const raw = guestFieldText(value);
  if (!raw) return false;
  const normalized = normalizeGuestCountDigits(raw);
  return /^\d+(?:人)?$/.test(normalized);
}

function breakdownFieldIsDefinite(value: unknown): boolean {
  const raw = guestFieldText(value);
  if (!raw) return true;
  return /^\d+$/.test(normalizeGuestCountDigits(raw));
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
    const raw = guestFieldText(field);
    if (!raw) return sum;
    const normalized = normalizeGuestCountDigits(raw);
    if (!/^\d+$/.test(normalized)) return sum;
    return sum + Number(normalized);
  }, 0);
}

/** 一覧の「人数不定」絞り込み用 */
export function hasIndefiniteGuestCount(source: GuestSource): boolean {
  const totalText = guestFieldText(source.guest_total);
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

  if (!totalText) {
    return breakdownSum(source) === 0;
  }

  return !isDefiniteGuestTotal(totalText);
}
