import { reservationNeedsCompanionInfo } from "@/lib/services/mail-pending";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import { todayIso, businessToday } from "@/lib/utils/date-label";
import { reservationMailStatuses } from "@/lib/utils/mail-kind-status";
import { mailKindChipState } from "@/lib/utils/task-chip";

/** ダッシュボード残タスク・一覧絞り込みで共通利用する予約行 */
export type ReservationTaskRow = {
  status: string;
  check_out: string | null;
  is_archived?: boolean;
  assignment_status: string | null;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  companion_form_answered: boolean;
  email: string | null;
  check_in: string | null;
  created_at?: string | null;
  sheet_created_at?: string | null;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
};

/** これから（checkout >= 今日）の有効予約 */
export function isUpcomingReservation(
  r: Pick<ReservationTaskRow, "check_out" | "is_archived">
): boolean {
  if (r.is_archived) return false;
  const today = todayIso();
  return !r.check_out || r.check_out >= today;
}

/** 同行者チップが action（今対応）の確定予約 */
export function reservationHasActiveCompanionTask(
  r: ReservationTaskRow,
  refDate: Date = businessToday()
): boolean {
  if (r.status !== "確定") return false;
  if (!isUpcomingReservation(r)) return false;
  if (effectiveGuestCountForCompanion(r) < 2) return false;
  return reservationNeedsCompanionInfo(
    { ...r, created_at: r.created_at ?? null, sheet_created_at: r.sheet_created_at ?? null },
    refDate
  );
}

/** 部屋割チップが action（未割当）の確定予約 */
export function reservationHasActiveAssignmentTask(r: ReservationTaskRow): boolean {
  if (r.status !== "確定") return false;
  if (!isUpcomingReservation(r)) return false;
  return r.assignment_status === "未割当";
}

/** 確認系チップ（予約確定/11日前/3日前）のいずれかが action の確定予約 */
export function reservationHasActiveConfirmationTask(
  r: ReservationTaskRow,
  refDate: Date = businessToday()
): boolean {
  if (r.status !== "確定") return false;
  if (!isUpcomingReservation(r)) return false;
  const statuses = reservationMailStatuses(r, refDate);
  return (["confirmation", "day11", "day3"] as const).some((key) => {
    const chip = mailKindChipState(statuses[key], r.status);
    return chip?.state === "action";
  });
}
