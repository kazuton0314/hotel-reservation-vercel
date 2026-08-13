import type { ReservationListItem } from "@/lib/queries/reservations";
import { isRoomAssignmentComplete } from "@/lib/services/assignment-status";
import {
  hasIndefiniteGuestCount,
  hasMismatchedGuestCount,
} from "@/lib/utils/guest-count-format";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import {
  ASSIGNED_ROOM_FILTER,
  UNSET_FILTER_VALUE,
  isBlankFilterFieldValue,
  isUnsetFilterValue,
} from "@/lib/list/filter-partition";

export const UNASSIGNED_ROOM_FILTER = "__unassigned__";
export { ASSIGNED_ROOM_FILTER, UNSET_FILTER_VALUE };

/**
 * 一覧フィルタ値 → SQL 比較用の生値（レガシー表記ゆれを吸収）。
 * BBQ「持参する」は過去データの「持込」「持参」も含める。
 * 未設定は SQL では扱わずメモリ側へ。
 */
export function sqlValuesForReservationFilter(
  field: string,
  value: string
): string[] {
  const v = String(value ?? "").trim();
  if (!v || isUnsetFilterValue(v)) return [];
  if (field === "bbq") {
    if (v === "持参する") return ["持参する", "持込", "持参"];
    return [v];
  }
  return [v];
}

function guestSourceFromItem(r: ReservationListItem) {
  return {
    guest_total: r.guest_total,
    adult_male: r.adult_male,
    adult_female: r.adult_female,
    boy_student: r.boy_student,
    girl_student: r.girl_student,
    age_3plus: r.age_3plus,
    under_3: r.under_3,
  };
}

/** 一覧の「部屋割: 未割当」。キャッシュ列ではなく実割当の人数一致で判定する */
export function isReservationRoomUnassigned(r: ReservationListItem): boolean {
  return !isRoomAssignmentComplete(r.guest_total, r.assignments);
}

export function isReservationRoomAssigned(r: ReservationListItem): boolean {
  return isRoomAssignmentComplete(r.guest_total, r.assignments);
}

/**
 * 一覧の「連絡: 未連絡」（ホーム「連絡未」と同じ集合）。
 * - 予約確定フラグ未送信 → アーカイブでも拾う
 * - 11日前など「今対応が必要」な残タスク → any_mail_pending
 *   （これから限定。アーカイブでは常に false。3日前は同行者側）
 */
export function isReservationContactPending(r: ReservationListItem): boolean {
  if (r.status !== "確定") return false;
  if (!r.completion_email_sent) return true;
  return Boolean(r.any_mail_pending);
}

function fieldRawValue(
  item: ReservationListItem,
  field: string
): string {
  return String((item as Record<string, unknown>)[field] ?? "").trim();
}

function matchesSqlEqFilterField(
  item: ReservationListItem,
  field: string,
  value: string
): boolean {
  if (isUnsetFilterValue(value)) {
    return isBlankFilterFieldValue((item as Record<string, unknown>)[field]);
  }
  const allowed = new Set(sqlValuesForReservationFilter(field, value));
  if (!allowed.size) return false;
  return allowed.has(fieldRawValue(item, field));
}

export function applyReservationListFilter(
  items: ReservationListItem[],
  field?: string,
  value?: string
): ReservationListItem[] {
  if (!field || !value) return items;

  if (field === "roomId") {
    if (value === UNASSIGNED_ROOM_FILTER) {
      return items.filter((r) => isReservationRoomUnassigned(r));
    }
    if (value === ASSIGNED_ROOM_FILTER) {
      return items.filter((r) => isReservationRoomAssigned(r));
    }
    return items.filter((r) =>
      r.assignments.some((a) => a.room_id === value)
    );
  }

  if (field === "companionInfo") {
    // タスク用の companion_pending は過去日・キャンセルで常に false になる。
    // 一覧フィルタは保存フラグ／対象人数で見る（アーカイブでも拾える）。
    if (value === "未回答") {
      return items.filter(
        (r) => r.companion_required && !r.companion_form_answered
      );
    }
    if (value === "回答済み") {
      return items.filter(
        (r) => r.companion_required && r.companion_form_answered
      );
    }
    if (value === "対象外") {
      return items.filter((r) => !r.companion_required);
    }
    return items;
  }

  if (field === "completionEmail") {
    if (
      value === CONTACT_LABELS.filterPending ||
      value === "未確認" ||
      value === "確認未完了"
    ) {
      return items.filter((r) => isReservationContactPending(r));
    }
    if (value === CONTACT_LABELS.filterDone || value === "確認済") {
      return items.filter((r) => !isReservationContactPending(r));
    }
    return items;
  }

  if (field === "guestTotal") {
    if (value === "不定") {
      return items.filter((r) => hasIndefiniteGuestCount(guestSourceFromItem(r)));
    }
    if (value === "不一致") {
      return items.filter((r) => hasMismatchedGuestCount(guestSourceFromItem(r)));
    }
    if (value === "確定") {
      return items.filter((r) => {
        const src = guestSourceFromItem(r);
        return (
          !hasIndefiniteGuestCount(src) && !hasMismatchedGuestCount(src)
        );
      });
    }
    return items;
  }

  if (
    field === "channel" ||
    field === "meal" ||
    field === "bbq" ||
    field === "somen" ||
    field === "payment_status"
  ) {
    return items.filter((r) => matchesSqlEqFilterField(r, field, value));
  }

  return items.filter((r) => {
    const record = r as Record<string, unknown>;
    return String(record[field] ?? "") === value;
  });
}

export { formatReceivedDateFromMs as formatReceivedDate } from "@/lib/utils/received-date";
