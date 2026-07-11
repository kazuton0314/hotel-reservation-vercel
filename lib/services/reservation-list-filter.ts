import type { ReservationListItem } from "@/lib/queries/reservations";

export const UNASSIGNED_ROOM_FILTER = "__unassigned__";

export function applyReservationListFilter(
  items: ReservationListItem[],
  field?: string,
  value?: string
): ReservationListItem[] {
  if (!field || !value) return items;

  if (field === "roomId") {
    if (value === UNASSIGNED_ROOM_FILTER) {
      return items.filter((r) => r.assignment_status === "未割当");
    }
    return items.filter((r) =>
      r.assignments.some((a) => a.room_id === value)
    );
  }

  if (field === "companionInfo") {
    if (value === "未回答") {
      return items.filter((r) => r.companion_pending);
    }
    if (value === "回答済み") {
      return items.filter(
        (r) => r.companion_required && !r.companion_pending
      );
    }
    return items;
  }

  if (field === "completionEmail") {
    if (value === "未送付") {
      return items.filter((r) => r.any_mail_pending);
    }
    if (value === "送付済") {
      return items.filter((r) => r.email && !r.any_mail_pending);
    }
    return items;
  }

  return items.filter((r) => {
    const record = r as Record<string, unknown>;
    return String(record[field] ?? "") === value;
  });
}

export { formatReceivedDateFromMs as formatReceivedDate } from "@/lib/utils/received-date";
