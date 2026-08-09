import { isRoomAssignmentComplete } from "@/lib/services/assignment-status";
import {
  reservationHasActiveCompanionTask,
  reservationHasActiveConfirmationTask,
  type ReservationTaskRow,
} from "@/lib/services/reservation-active-tasks";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import { businessToday } from "@/lib/utils/date-label";

export type DashboardCountRow = ReservationTaskRow & {
  reservation_id: string;
};

export type DashboardAssignmentRow = {
  reservation_id: string;
  assigned_guest_count: number | null;
  male_count: number | null;
  female_count: number | null;
  boy_student_count: number | null;
  girl_student_count: number | null;
  age_3plus_count: number | null;
  under_3_count: number | null;
};

/**
 * ホーム件数の共通定義（一覧のデフォルト「これから」と同じ母集団）。
 * - 仮予約／確定: 非アーカイブかつ check_out >= 今日
 * - 同行者未回答: 確定かつ 2名以上かつ未回答（1名は対象外）
 * - 連絡未: 予約確定・11日前の今対応
 * - 部屋未割当: 実部屋割＋人数一致（キャッシュ列ではない）
 */
export function computeDashboardCounts(
  upcomingRows: DashboardCountRow[],
  assignmentsByReservation: Map<string, DashboardAssignmentRow[]>,
  refDate: Date = businessToday()
) {
  const provisionalCount = upcomingRows.filter((r) => r.status === "仮予約").length;
  const confirmedRows = upcomingRows.filter((r) => r.status === "確定");
  const confirmedCount = confirmedRows.length;

  const companionPendingCount = confirmedRows.filter((r) =>
    reservationHasActiveCompanionTask(r, refDate)
  ).length;
  const companionAnsweredCount = confirmedRows.filter(
    (r) =>
      effectiveGuestCountForCompanion(r) >= 2 && r.companion_form_answered
  ).length;
  const companionNotRequiredCount = confirmedRows.filter(
    (r) => effectiveGuestCountForCompanion(r) < 2
  ).length;

  const reservationMailPendingCount = confirmedRows.filter((r) =>
    reservationHasActiveConfirmationTask(r, refDate)
  ).length;

  const unassignedCount = confirmedRows.filter((r) => {
    const assignments = assignmentsByReservation.get(r.reservation_id) ?? [];
    return !isRoomAssignmentComplete(r.guest_total, assignments);
  }).length;

  return {
    provisionalCount,
    confirmedCount,
    companionPendingCount,
    companionAnsweredCount,
    companionNotRequiredCount,
    reservationMailPendingCount,
    unassignedCount,
  };
}

export function groupAssignmentsByReservation(
  rows: DashboardAssignmentRow[]
): Map<string, DashboardAssignmentRow[]> {
  const map = new Map<string, DashboardAssignmentRow[]>();
  for (const row of rows) {
    const list = map.get(row.reservation_id) ?? [];
    list.push(row);
    map.set(row.reservation_id, list);
  }
  return map;
}
