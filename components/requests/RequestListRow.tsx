import Link from "next/link";
import type { RequestListItem } from "@/lib/queries/requests";
import { formatReceivedDate } from "@/lib/services/reservation-list-filter";
import { formatDisplayName } from "@/lib/utils/display-name";

function statusBadge(status: string) {
  let cls = "badge badge-status";
  if (status === "リクエスト") cls += " badge-status-request";
  else if (status === "承認済" || status === "本予約連携済")
    cls += " badge-confirmed badge-status-confirmed";
  else if (status === "却下") cls += " badge-cancelled badge-status-cancelled";
  const label = status === "本予約連携済" ? "承認済" : status;
  return <span className={cls}>{label}</span>;
}

function mailBadge(item: RequestListItem) {
  if (!item.email) return null;
  if (
    item.status !== "承認済" &&
    item.status !== "却下" &&
    item.status !== "本予約連携済"
  ) {
    return null;
  }
  if (item.reply_email_sent) return null;
  return <span className="badge badge-todo badge-todo-warn">返信未</span>;
}

export function RequestListRow({ item }: { item: RequestListItem }) {
  const received = formatReceivedDate(item.received_ms);
  const displayName = formatDisplayName(item.representative_name);

  return (
    <Link
      href={`/requests/${encodeURIComponent(item.request_id)}`}
      prefetch
      className="card request-card list-card request-row-card block"
    >
      <div className="row-card-head">
        <p className="card-title list-card-title">{displayName}</p>
        <div className="row-card-badges">
          {statusBadge(item.status)}
          {mailBadge(item)}
        </div>
      </div>
      <p className="card-sub">
        {item.request_id} / {item.check_in ?? "—"}〜{item.check_out ?? "—"}
        {received ? ` / 受付 ${received}` : ""}
      </p>
      {item.guest_total ? (
        <p className="card-row">
          <strong>宿泊人数:</strong> {item.guest_total}
        </p>
      ) : null}
    </Link>
  );
}
