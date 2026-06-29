import Link from "next/link";
import type { ReservationListItem } from "@/lib/queries/reservations";

const STATUS_COLORS: Record<string, string> = {
  確定: "bg-blue-100 text-blue-800",
  仮予約: "bg-amber-100 text-amber-800",
  キャンセル: "bg-zinc-200 text-zinc-600",
};

export function ReservationListRow({ item }: { item: ReservationListItem }) {
  const statusClass =
    STATUS_COLORS[item.status] ?? "bg-zinc-100 text-zinc-700";

  return (
    <Link
      href={`/reservations/${encodeURIComponent(item.reservation_id)}`}
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {item.representative_name || "（代表者名なし）"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{item.reservation_id}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
        >
          {item.status}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div>
          <dt className="text-zinc-500">チェックイン</dt>
          <dd>{item.check_in ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">チェックアウト</dt>
          <dd>{item.check_out ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">人数</dt>
          <dd>{item.guest_total || "—"}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">部屋割</dt>
          <dd>{item.assignment_status || "—"}</dd>
        </div>
      </dl>
    </Link>
  );
}
