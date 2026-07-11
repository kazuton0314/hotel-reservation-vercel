import type { MailKindStatus } from "@/lib/utils/mail-kind-status";

/** GAS reservationMailKindBadgeHtml_ 相当 */
export function MailKindBadge({ status }: { status: MailKindStatus }) {
  const title = status.sentAtStr ? status.sentAtStr : undefined;
  if (status.reason && status.notRequired) {
    return (
      <span className="badge badge-muted badge-mail-kind" title={title}>
        {status.label}不要
      </span>
    );
  }
  if (status.sent) {
    return (
      <span className="badge badge-ok badge-mail-kind" title={title}>
        {status.label}済
      </span>
    );
  }
  if (status.pending) {
    return (
      <span className="badge badge-warn badge-mail-kind" title={title}>
        {status.label}未送付
      </span>
    );
  }
  if (status.notRequired) {
    return (
      <span className="badge badge-muted badge-mail-kind" title={title}>
        {status.label}—
      </span>
    );
  }
  return (
    <span className="badge badge-default badge-mail-kind" title={title}>
      {status.label}—
    </span>
  );
}

type Props = {
  statuses: {
    confirmation: MailKindStatus;
    day11: MailKindStatus;
    day3: MailKindStatus;
  };
};

/** GAS reservationListMailBadgesHtml_ 相当 — 3種すべて表示 */
export function MailKindBadgeGroup({ statuses }: Props) {
  const items = [statuses.confirmation, statuses.day11, statuses.day3];
  return (
    <span className="badge-group badge-group-mail">
      {items.map((st) => (
        <MailKindBadge key={st.kind} status={st} />
      ))}
    </span>
  );
}
