import type { RequestListItem } from "@/lib/queries/requests";
import { ListCardStayDetails } from "@/components/list/ListCardStayDetails";
import { RequestListStatusActions } from "@/components/requests/RequestListStatusActions";
import { RequestTaskChips } from "@/components/requests/RequestTaskChips";
import { PendingLink } from "@/components/ui/PendingLink";
import { formatReceivedDate } from "@/lib/services/reservation-list-filter";
import { formatDisplayName } from "@/lib/utils/display-name";

export function RequestListRow({ item }: { item: RequestListItem }) {
  const received = formatReceivedDate(item.received_ms);
  const displayName = formatDisplayName(item.representative_name);

  return (
    <PendingLink
      href={`/requests/${encodeURIComponent(item.request_id)}`}
      prefetch
      className="card request-card list-card request-row-card block"
    >
      <div className="row-card-head">
        <p className="card-title list-card-title">{displayName}</p>
      </div>
      <div className="row-card-status-row">
        <RequestListStatusActions
          requestId={item.request_id}
          status={item.status}
          updatedAt={item.updated_at}
        />
      </div>
      <p className="card-sub">
        {item.request_id} / {item.check_in ?? "—"}〜{item.check_out ?? "—"}
        {received ? ` / 受付 ${received}` : ""}
      </p>
      <RequestTaskChips
        status={item.status}
        email={item.email}
        replyEmailSent={item.reply_email_sent}
      />
      <ListCardStayDetails
        guests={item.guest_total}
        inquiry={item.inquiry}
        internalMemo={item.internal_memo}
      />
    </PendingLink>
  );
}
