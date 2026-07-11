const RECEIVED_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/** 一覧の受付日時（ミリ秒） */
export function formatReceivedDateFromMs(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", RECEIVED_DATETIME_OPTS);
}

/** 詳細の受付日時（ISO文字列） */
export function formatReceivedDateFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ja-JP", RECEIVED_DATETIME_OPTS);
}
