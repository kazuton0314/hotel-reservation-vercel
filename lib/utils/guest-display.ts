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

function guestFieldNumber(value: unknown): number {
  const s = guestFieldText(value);
  return s !== "" && /^\d+$/.test(s) ? Number(s) : 0;
}

/** 「4人」「5人～6人」などから先頭の数字だけ取り出す */
export function parseGuestCountFromText(value: string | null | undefined): number {
  if (!value) return 0;
  const m = String(value).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function formatGuestBreakdownPart(prefix: string, value: unknown): string {
  const n = parseInt(String(value ?? ""), 10);
  return !Number.isNaN(n) && n > 0 ? `${prefix}${n}` : "";
}

/** GAS formatGuestCompact_ 相当 */
export function formatGuestCompact(source: GuestSource): string {
  const totalText = guestFieldText(source.guest_total);
  const parts = [
    formatGuestBreakdownPart("男", source.adult_male),
    formatGuestBreakdownPart("女", source.adult_female),
    formatGuestBreakdownPart("小男", source.boy_student),
    formatGuestBreakdownPart("小女", source.girl_student),
    formatGuestBreakdownPart("幼", source.age_3plus),
    formatGuestBreakdownPart("未", source.under_3),
  ].filter(Boolean);
  const breakdown = parts.join("");
  if (totalText && breakdown) return `${totalText}(${breakdown})`;
  if (breakdown) return breakdown;
  if (totalText) return totalText;
  return "—";
}

export function effectiveGuestCountForCompanion(source: GuestSource): number {
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
