import { TaskChip } from "@/components/list/TaskChip";
import {
  assignmentChipState,
  companionChipState,
  mailKindChipState,
} from "@/lib/utils/task-chip";
import { reservationMailStatuses } from "@/lib/utils/mail-kind-status";

export type ReservationTaskChipSource = {
  status: string;
  email: string | null;
  check_in: string | null;
  check_out: string | null;
  created_at?: string | null;
  sheet_created_at?: string | null;
  assignment_status: string | null;
  companion_required: boolean;
  companion_pending: boolean;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  companion_form_answered: boolean;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
};

const MAIL_KINDS = [
  { key: "confirmation" as const, label: "予約確定" },
  { key: "day11" as const, label: "11日前" },
  { key: "day3" as const, label: "3日前" },
];

/** 本予約カードのタスクチップ行（ホーム・一覧で共通） */
export function ReservationTaskChips({ item }: { item: ReservationTaskChipSource }) {
  if (item.status !== "確定") return null;

  const mailStatuses = reservationMailStatuses({
    status: item.status,
    email: item.email,
    check_in: item.check_in,
    check_out: item.check_out,
    created_at: item.created_at,
    sheet_created_at: item.sheet_created_at,
    completion_email_sent: item.completion_email_sent,
    day11_email_sent: item.day11_email_sent,
    day3_email_sent: item.day3_email_sent,
    companion_form_answered: item.companion_form_answered,
    guest_total: item.guest_total,
    adult_male: item.adult_male,
    adult_female: item.adult_female,
    boy_student: item.boy_student,
    girl_student: item.girl_student,
    age_3plus: item.age_3plus,
    under_3: item.under_3,
  });

  const assignment = assignmentChipState(item.assignment_status);
  const mailChips = MAIL_KINDS.flatMap(({ key, label }) => {
    const chip = mailKindChipState(mailStatuses[key], item.status);
    if (!chip) return [];
    return [{ key, label, ...chip }];
  });

  return (
    <div className="status-groups compact">
      {item.companion_required ? (
        <TaskChip label="同行者" {...companionChipState(item.companion_pending)} />
      ) : null}
      <TaskChip label="部屋割" state={assignment.state} title={assignment.title} />
      {mailChips.map(({ key, label, state, title }) => (
        <TaskChip key={key} label={label} state={state} title={title} />
      ))}
    </div>
  );
}
