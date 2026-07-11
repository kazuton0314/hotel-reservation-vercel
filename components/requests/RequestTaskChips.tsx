import { TaskChip } from "@/components/list/TaskChip";
import { requestReplyChipState } from "@/lib/utils/task-chip";

type Props = {
  status: string;
  email: string | null;
  replyEmailSent: boolean;
};

/** リクエストカードのタスクチップ行（本予約の ReservationTaskChips と同じ配置） */
export function RequestTaskChips({ status, email, replyEmailSent }: Props) {
  const hasEmail = Boolean(email?.trim());
  const chip = requestReplyChipState(status, hasEmail, replyEmailSent);
  if (!chip) return null;

  return (
    <div className="status-groups compact">
      <TaskChip label="返信" state={chip.state} title={chip.title} />
    </div>
  );
}
