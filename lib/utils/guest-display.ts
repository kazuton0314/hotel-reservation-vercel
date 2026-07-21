import {
  classifyGuestTotal,
  normalizeGuestBreakdownForStorage,
} from "@/lib/utils/guest-count-format";

type GuestSource = {
  guest_total?: string | null;
  adult_male?: string | null;
  adult_female?: string | null;
  boy_student?: string | null;
  girl_student?: string | null;
  age_3plus?: string | null;
  under_3?: string | null;
};

function guestFieldNumber(value: unknown): number {
  const normalized = normalizeGuestBreakdownForStorage(
    value == null ? null : String(value)
  );
  return normalized && /^\d+$/.test(normalized) ? Number(normalized) : 0;
}

/** 「4人」「5人～6人」などから先頭の数字だけ取り出す */
export function parseGuestCountFromText(value: string | null | undefined): number {
  if (!value) return 0;
  const m = String(value).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function formatGuestBreakdownPart(prefix: string, value: unknown): string {
  const n = guestFieldNumber(value);
  return n > 0 ? `${prefix}${n}` : "";
}

/** 未就学（3歳未満）を除いた人数 */
export function guestMainCount(source: GuestSource): number {
  const classified = classifyGuestTotal(source.guest_total);
  if (classified.kind === "definite" && classified.stored) {
    return Number(classified.stored);
  }
  const fromTotal = parseGuestCountFromText(source.guest_total);
  if (fromTotal > 0) return fromTotal;
  return (
    guestFieldNumber(source.adult_male) +
    guestFieldNumber(source.adult_female) +
    guestFieldNumber(source.boy_student) +
    guestFieldNumber(source.girl_student) +
    guestFieldNumber(source.age_3plus)
  );
}

export function guestUnder3Count(source: GuestSource): number {
  return guestFieldNumber(source.under_3);
}

/** 合計と未就学を「12+2」形式で（未就学0なら合計のみ） */
export function formatGuestCountWithInfants(
  main: number,
  under3: number
): string {
  if (main <= 0 && under3 <= 0) return "";
  if (under3 > 0 && main > 0) return `${main}+${under3}`;
  if (under3 > 0) return `+${under3}`;
  return String(main);
}

export function formatGuestCountWithInfantsFromSource(
  source: GuestSource
): string {
  return formatGuestCountWithInfants(
    guestMainCount(source),
    guestUnder3Count(source)
  );
}

/** 表示用の合計人数。確定値は半角数字のみ、不定は原文 */
export function formatGuestTotalLabel(
  guestTotal: string | null | undefined
): string {
  const classified = classifyGuestTotal(guestTotal);
  if (classified.kind === "empty") return "";
  return classified.stored ?? "";
}

/**
 * 一覧・カード・カレンダー・GCal 共通の人数表示。
 * 未就学（3歳未満）は括弧内ではなく「+N」で添える。
 */
export function formatGuestCompact(source: GuestSource): string {
  const totalText = formatGuestTotalLabel(source.guest_total);
  const under3 = guestUnder3Count(source);
  const parts = [
    formatGuestBreakdownPart("男", source.adult_male),
    formatGuestBreakdownPart("女", source.adult_female),
    formatGuestBreakdownPart("小男", source.boy_student),
    formatGuestBreakdownPart("小女", source.girl_student),
    formatGuestBreakdownPart("幼", source.age_3plus),
  ].filter(Boolean);
  const breakdown = parts.join("");
  let base = "";
  if (totalText && breakdown) base = `${totalText}(${breakdown})`;
  else if (breakdown) base = breakdown;
  else if (totalText) base = totalText;

  if (under3 > 0) {
    return base ? `${base}+${under3}` : `+${under3}`;
  }
  return base || "—";
}

export function effectiveGuestCountForCompanion(source: GuestSource): number {
  const classified = classifyGuestTotal(source.guest_total);
  if (classified.kind === "definite" && classified.stored) {
    return Number(classified.stored);
  }
  const fromTotal = parseGuestCountFromText(source.guest_total);
  if (fromTotal > 0) return fromTotal;
  return (
    guestFieldNumber(source.adult_male) +
    guestFieldNumber(source.adult_female) +
    guestFieldNumber(source.boy_student) +
    guestFieldNumber(source.girl_student) +
    guestFieldNumber(source.age_3plus) +
    guestFieldNumber(source.under_3)
  );
}
