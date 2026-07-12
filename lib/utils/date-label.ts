import { parseDateValue, stripTime } from "@/lib/import/date-utils";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const BUSINESS_TIMEZONE = "Asia/Tokyo";

/** 業務上の「今日」（JST 基準・サーバー UTC でも正しい日付） */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** YYYY-MM-DD をローカル日付として解釈（UTC ずれを避ける） */
export function parseBusinessDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 業務タイムゾーン基準の「今日」の Date */
export function businessToday(): Date {
  return parseBusinessDate(todayIso());
}

export function formatDateJa(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function weekdayJa(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

export function formatDateLabel(date: Date): string {
  return `${formatDateJa(date)}（${weekdayJa(date)}）`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function daysBetweenCalendarDates(fromDate: Date, toDate: Date): number {
  const from = stripTime(fromDate);
  const to = stripTime(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function parseReservationDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return parseDateValue(value);
}
