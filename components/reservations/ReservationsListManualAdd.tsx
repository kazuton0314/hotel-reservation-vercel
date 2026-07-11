import Link from "next/link";

export function ReservationsListManualAdd() {
  return (
    <div className="list-actions-row">
      <Link href="/reservations/new" className="btn btn-secondary btn-sm">
        + 手動追加
      </Link>
    </div>
  );
}
