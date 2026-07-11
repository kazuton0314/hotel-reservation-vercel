import { TaskChip } from "@/components/list/TaskChip";
import { requestConfirmChipState } from "@/lib/utils/task-chip";

type Props = {
  status: string;
  email: string | null;
  replyEmailSent: boolean;
};

/** リクエストカードのタスクチップ行（本予約の ReservationTaskChips と同じ配置） */
export function RequestTaskChips({ status, replyEmailSent }: Props) {
  const chip = requestConfirmChipState(status, replyEmailSent);
  if (!chip) return null;

  return (
    <div className="status-groups compact">
      <TaskChip label="リクエスト確認" state={chip.state} title={chip.title} />
    </div>
  );
}
