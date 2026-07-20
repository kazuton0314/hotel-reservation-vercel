export type MatchableRequest = {
  request_id: string;
  status: string;
  linked_reservation_id: string | null;
  check_in: string | null;
  check_out: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
};

export type MatchableReservation = {
  reservation_id: string;
  status: string;
  request_id: string | null;
  check_in: string | null;
  check_out: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
};

export function normalizeText(v: string | null | undefined) {
  return String(v ?? "").trim().toLowerCase();
}

export function normalizePhone(v: string | null | undefined) {
  return normalizeText(v).replace(/[^\d]/g, "");
}

/** 電話比較用: 末尾10桁（GAS guestIdentityMatchesForLink_ 相当） */
export function phoneTail10(v: string | null | undefined): string {
  const digits = normalizePhone(v);
  if (digits.length < 10) return digits;
  return digits.slice(-10);
}

export function nameMatches(
  aLast: string | null,
  aFirst: string | null,
  bLast: string | null,
  bFirst: string | null
) {
  return (
    normalizeText(aLast) === normalizeText(bLast) &&
    normalizeText(aFirst) === normalizeText(bFirst)
  );
}

export function contactMatches(
  aEmail: string | null,
  aPhone: string | null,
  bEmail: string | null,
  bPhone: string | null
) {
  const emailA = normalizeText(aEmail);
  const emailB = normalizeText(bEmail);
  if (emailA && emailB && emailA === emailB) return true;

  const tailA = phoneTail10(aPhone);
  const tailB = phoneTail10(bPhone);
  return Boolean(tailA && tailB && tailA.length >= 10 && tailA === tailB);
}

/** チェックイン日: 完全一致 or 月日一致（年ズレ救済）。月日は必須。リンク照合用。 */
export function checkInMatches(aCheckIn: string | null, bCheckIn: string | null) {
  if (!aCheckIn || !bCheckIn) return false;
  if (aCheckIn === bCheckIn) return true;
  const mdA = aCheckIn.slice(5);
  const mdB = bCheckIn.slice(5);
  return Boolean(mdA && mdB && mdA === mdB);
}

/** 取込重複判定用: 年を含むチェックイン完全一致のみ */
export function checkInMatchesExact(
  aCheckIn: string | null,
  bCheckIn: string | null
) {
  if (!aCheckIn || !bCheckIn) return false;
  return aCheckIn === bCheckIn;
}

/** 行番号再利用時の「同一回答」判定（姓名+連絡先+チェックイン年月日） */
export function sameImportIdentity(
  a: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
  },
  b: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
  }
) {
  if (!checkInMatchesExact(a.check_in, b.check_in)) return false;
  if (!nameMatches(a.last_name, a.first_name, b.last_name, b.first_name)) {
    return false;
  }
  return contactMatches(a.email, a.phone, b.email, b.phone);
}

export function stayMatches(
  aCheckIn: string | null,
  aCheckOut: string | null,
  bCheckIn: string | null,
  bCheckOut: string | null
) {
  if (!checkInMatches(aCheckIn, bCheckIn)) return false;
  if (!aCheckOut || !bCheckOut) return true;
  return aCheckOut === bCheckOut;
}

/** 取込重複判定用: 宿泊日は年月日から完全一致 */
export function stayMatchesExact(
  aCheckIn: string | null,
  aCheckOut: string | null,
  bCheckIn: string | null,
  bCheckOut: string | null
) {
  if (!checkInMatchesExact(aCheckIn, bCheckIn)) return false;
  if (!aCheckOut || !bCheckOut) return true;
  return aCheckOut === bCheckOut;
}

/** 姓名 + (メール or 電話) + チェックイン月日 */
export function bookingEntryMatchesForLink(
  a: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
  },
  b: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
  }
) {
  if (!checkInMatches(a.check_in, b.check_in)) return false;
  if (!nameMatches(a.last_name, a.first_name, b.last_name, b.first_name)) {
    return false;
  }
  return contactMatches(a.email, a.phone, b.email, b.phone);
}

export {
  isRequestNeedingLink,
  isRequestOpenForLink,
} from "@/lib/domain/request-status";

