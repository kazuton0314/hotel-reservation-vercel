import Link from "next/link";
import type { RequestListItem } from "@/lib/queries/requests";

const STATUS_COLORS: Record<string, string> = {
  リクエスト: "bg-amber-100 text-amber-800",
  承認済: "bg-blue-100 text-blue-800",
  却下: "bg-rose-100 text-rose-800",
  本予約連携済: "bg-emerald-100 text-emerald-800",
};

export function RequestListRow({ item }: { item: RequestListItem }) {
  const statusClass = STATUS_COLORS[item.status] ?? "bg-zinc-100 text-zinc-700";

  return (
    <Link
      href={`/requests/${encodeURIComponent(item.request_id)}`}
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {item.representative_name || "（代表者名なし）"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{item.request_id}</p>
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
          <dt className="text-zinc-500">本予約連携</dt>
          <dd>{item.linked_reservation_id || "未連携"}</dd>
        </div>
      </dl>
    </Link>
  );
}
