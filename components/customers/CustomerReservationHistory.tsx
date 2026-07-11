import Link from "next/link";

type Reservation = {
  reservationId: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
  channel: string | null;
};

type Props = {
  reservations: Reservation[];
  customerLinkId: string;
};

export function CustomerReservationHistory({
  reservations,
  customerLinkId,
}: Props) {
  if (!reservations.length) {
    return (
      <p className="empty" style={{ padding: 8 }}>
        予約履歴がありません
      </p>
    );
  }

  return (
    <div className="customer-history-list">
      {reservations.map((r) => (
        <Link
          key={r.reservationId}
          href={`/reservations/${encodeURIComponent(r.reservationId)}?from=customers&customer=${encodeURIComponent(customerLinkId)}`}
          className="customer-history-row block"
        >
          <div className="customer-history-row-main">
            <span className="customer-history-id">{r.reservationId}</span>
            <span className="customer-history-status">{r.status || "—"}</span>
          </div>
          <p className="customer-history-meta">
            {r.checkIn ?? "—"}〜{r.checkOut ?? "—"}
            {r.channel ? ` / ${r.channel}` : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}
