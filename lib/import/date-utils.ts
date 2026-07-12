import {
  resolveMaxCheckInDate,
  type BuildCheckInDateOptions,
} from "@/lib/import/booking-horizon";

export {
  MAX_BOOKING_ADVANCE_DAYS,
  addCalendarDays,
  isCheckInWithinBookingHorizon,
  type BuildCheckInDateOptions,
} from "@/lib/import/booking-horizon";

export function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseMonthDay(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
}

function parseYear(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : null;
}

function validDate(year: number, month: number, day: number): Date | null {
  const d = new Date(year, month - 1, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return stripTime(d);
}

/** GAS buildCheckInDate 相当 */
export function buildCheckInDate(
  yearVal: unknown,
  monthVal: unknown,
  dayVal: unknown,
  referenceDate: Date = new Date(),
  options: BuildCheckInDateOptions = {}
): Date | null {
  const month = parseMonthDay(monthVal);
  const day = parseMonthDay(dayVal);
  if (!month || !day) return null;

  const explicitYear = parseYear(yearVal);
  if (explicitYear) {
    return validDate(explicitYear, month, day);
  }

  const ref = stripTime(referenceDate);
  const year = ref.getFullYear();
  const maxCheckIn = resolveMaxCheckInDate(ref, options.maxCheckInDate);
  let checkIn = validDate(year, month, day);
  if (!checkIn) return null;

  if (checkIn.getTime() < ref.getTime()) {
    const nextYear = year + 1;
    const bumped = validDate(nextYear, month, day);
    if (bumped && bumped.getTime() <= maxCheckIn.getTime()) {
      checkIn = bumped;
    }
  }
  return checkIn;
}

/** GAS buildCheckOutDate 相当 */
export function buildCheckOutDate(
  checkIn: Date,
  yearVal: unknown,
  monthVal: unknown,
  dayVal: unknown
): Date | null {
  const month = parseMonthDay(monthVal);
  const day = parseMonthDay(dayVal);
  if (!month || !day) return null;

  const explicitYear = parseYear(yearVal);
  if (explicitYear) {
    const checkOut = validDate(explicitYear, month, day);
    if (!checkOut || checkOut.getTime() <= checkIn.getTime()) return null;
    return checkOut;
  }

  const year = checkIn.getFullYear();
  let checkOut = validDate(year, month, day);
  if (!checkOut) return null;

  if (checkOut.getTime() <= checkIn.getTime()) {
    checkOut = validDate(year + 1, month, day);
  }
  return checkOut;
}

export function calculateNights(checkIn: Date | null, checkOut: Date | null): number {
  if (!checkIn || !checkOut) return 0;
  const diff = Math.round(
    (checkOut.getTime() - checkIn.getTime()) / 86400000
  );
  return diff > 0 ? diff : 0;
}

export function formatDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateValue(value: unknown): Date | null {
  if (value === "" || value == null) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return stripTime(value);
  }
  const s = String(value).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) {
    return validDate(
      parseInt(iso[1], 10),
      parseInt(iso[2], 10),
      parseInt(iso[3], 10)
    );
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return stripTime(d);
  return null;
}

export function joinName(lastName: string, firstName: string): string {
  return [lastName, firstName].filter(Boolean).join(" ").trim();
}

export function buildAddress(
  postal: string,
  pref: string,
  city: string,
  line: string
): string {
  return [postal, pref, city, line].filter(Boolean).join(" ").trim();
}
