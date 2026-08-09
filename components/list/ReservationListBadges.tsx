import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";

export function ReservationStatusBadge({ status }: { status: string }) {
  let cls = "badge badge-status";  if (status === "仮予約") cls += " badge-provisional badge-status-provisional";
  else if (status === "確定") cls += " badge-confirmed badge-status-confirmed";
  else if (status === "キャンセル") cls += " badge-cancelled badge-status-cancelled";
  return <span className={cls}>{status}</span>;
}

export function CompanionStatusBadge({
  required,
  pending,
}: {
  required: boolean;
  pending: boolean;
}) {
  if (!required) return null;
  if (!pending) {
    return <span className="badge badge-todo badge-todo-ok">同行者済</span>;
  }
  return <span className="badge badge-todo badge-todo-warn">同行者未</span>;
}

export function AssignmentStatusBadge({ status }: { status: string | null }) {
  if (status === "割当済") return null;
  return <span className="badge badge-todo badge-todo-warn">部屋未割</span>;
}

type MailStatuses = {
  confirmation: { pending: boolean; notRequired: boolean; sent: boolean };
  day11: { pending: boolean; notRequired: boolean; sent: boolean };
  day3: { pending: boolean; notRequired: boolean; sent: boolean };
};

function hasMailTodo(statuses: MailStatuses) {
  // 3日前は同行者催促。カードの「連絡未」バッジは予約確定・11日前のみ
  return [statuses.confirmation, statuses.day11].some(
    (s) => s.pending && !s.notRequired && !s.sent
  );
}

export function ReservationConfirmedBadges({
  status,
  assignmentStatus,
  companionRequired,
  companionPending,
  mailStatuses,
}: {
  status: string;
  assignmentStatus: string | null;
  companionRequired: boolean;
  companionPending: boolean;
  mailStatuses?: MailStatuses | null;
}) {
  if (status !== "確定") return null;

  return (
    <span className="badge-group badge-group-reservation">
      <CompanionStatusBadge
        required={companionRequired}
        pending={companionPending}
      />
      <AssignmentStatusBadge status={assignmentStatus} />
      {mailStatuses && hasMailTodo(mailStatuses) ? (
        <span className="badge badge-todo badge-todo-warn">{CONTACT_LABELS.badgePending}</span>
      ) : null}
    </span>
  );
}
