function stripTimeLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 予約受付: チェックインが基準日から最大何日先までか（1年以上先は不可） */
export const MAX_BOOKING_ADVANCE_DAYS = 365;

export type BuildCheckInDateOptions = {
  /** 年推定で繰り上げ可能な最遅チェックイン日（未指定時は reference + 365日） */
  maxCheckInDate?: Date;
};

export function addCalendarDays(date: Date, days: number): Date {
  const d = stripTimeLocal(date);
  d.setDate(d.getDate() + days);
  return stripTimeLocal(d);
}

/** チェックインが受付可能範囲内か（基準日当日〜基準日+365日） */
export function isCheckInWithinBookingHorizon(
  checkIn: Date,
  referenceDate: Date = new Date()
): boolean {
  const ref = stripTimeLocal(referenceDate);
  const ci = stripTimeLocal(checkIn);
  if (ci.getTime() < ref.getTime()) return false;
  const limit = addCalendarDays(ref, MAX_BOOKING_ADVANCE_DAYS);
  return ci.getTime() <= limit.getTime();
}

export function resolveMaxCheckInDate(
  referenceDate: Date,
  maxCheckInDate?: Date
): Date {
  return maxCheckInDate ?? addCalendarDays(referenceDate, MAX_BOOKING_ADVANCE_DAYS);
}
