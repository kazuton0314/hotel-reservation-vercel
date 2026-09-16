/** 予約IDは保存されている完全な形式で表示する。 */
export function formatReservationId(reservationId: string | null | undefined): string {
  return String(reservationId ?? "").trim();
}
