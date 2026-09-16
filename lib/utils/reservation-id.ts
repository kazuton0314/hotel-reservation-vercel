/** 過去取込IDは内部接頭辞を隠し、帳票の連番だけを表示する。 */
export function formatReservationId(reservationId: string | null | undefined): string {
  const value = String(reservationId ?? "").trim();
  const historical = value.match(/^PAST-\d{4}-(\d+)$/i);
  return historical ? historical[1] : value;
}
