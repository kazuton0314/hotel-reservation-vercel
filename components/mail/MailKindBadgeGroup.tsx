import type { MailKindStatus } from "@/lib/utils/mail-kind-status";
import { mailKindChipState } from "@/lib/utils/task-chip";
import { TaskChip } from "@/components/list/TaskChip";

/** 詳細画面のメール種別チップ（一覧と同じ色体系） */
export function MailKindBadge({
  status,
  hasEmail = true,
  reservationStatus = "確定",
}: {
  status: MailKindStatus;
  hasEmail?: boolean;
  reservationStatus?: string;
}) {
  const chip = mailKindChipState(status, hasEmail, reservationStatus);
  return <TaskChip label={status.label} state={chip.state} title={chip.title} />;
}

type Props = {
  statuses: {
    confirmation: MailKindStatus;
    day11: MailKindStatus;
    day3: MailKindStatus;
  };
  hasEmail?: boolean;
  reservationStatus?: string;
};

export function MailKindBadgeGroup({
  statuses,
  hasEmail = true,
  reservationStatus = "確定",
}: Props) {
  const items = [statuses.confirmation, statuses.day11, statuses.day3];
  return (
    <span className="badge-group badge-group-mail">
      {items.map((st) => (
        <MailKindBadge
          key={st.kind}
          status={st}
          hasEmail={hasEmail}
          reservationStatus={reservationStatus}
        />
      ))}
    </span>
  );
}
