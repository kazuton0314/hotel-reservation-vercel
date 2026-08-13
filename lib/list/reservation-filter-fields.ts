import type { ListFilterFieldDef } from "@/components/list/ReservationListFilterBar";
import {
  LIST_FILTER_BBQ_OPTIONS,
  LIST_FILTER_CHANNEL_OPTIONS,
  LIST_FILTER_MEAL_OPTIONS,
  LIST_FILTER_PAYMENT_OPTIONS,
  LIST_FILTER_SOMEN_OPTIONS,
} from "@/lib/config/field-options";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import {
  ASSIGNED_ROOM_FILTER,
  withUnsetOption,
} from "@/lib/list/filter-partition";
import { UNASSIGNED_ROOM_FILTER } from "@/lib/services/reservation-list-filter";

type RoomOption = { room_id: string; room_name: string };

function eqFieldOptions(values: readonly string[]) {
  return withUnsetOption(values.map((value) => ({ value, label: value })));
}

/** 本予約一覧・一覧設定で共通の絞り込み定義 */
export function buildReservationListFilterFields(
  rooms: RoomOption[]
): ListFilterFieldDef[] {
  return [
    {
      key: "channel",
      label: "予約経路",
      options: eqFieldOptions(LIST_FILTER_CHANNEL_OPTIONS),
    },
    {
      key: "roomId",
      label: "部屋割",
      options: [
        { value: UNASSIGNED_ROOM_FILTER, label: "未割当" },
        { value: ASSIGNED_ROOM_FILTER, label: "割当済" },
        // 個別部屋は割当済の内訳（複数部屋は複数に出るため、合計は未割当+割当済で見る）
        ...rooms.map((r) => ({
          value: r.room_id,
          label: r.room_name,
        })),
      ],
    },
    {
      key: "payment_status",
      label: "支払い",
      options: eqFieldOptions(LIST_FILTER_PAYMENT_OPTIONS),
    },
    {
      key: "meal",
      label: "食事",
      options: eqFieldOptions(LIST_FILTER_MEAL_OPTIONS),
    },
    {
      key: "bbq",
      label: "BBQ",
      options: eqFieldOptions(LIST_FILTER_BBQ_OPTIONS),
    },
    {
      key: "somen",
      label: "流しそうめん",
      options: eqFieldOptions(LIST_FILTER_SOMEN_OPTIONS),
    },
    {
      key: "companionInfo",
      label: "同行者情報",
      options: [
        { value: "未回答", label: "同行者未回答（2名以上）" },
        { value: "回答済み", label: "同行者回答済（2名以上）" },
        { value: "対象外", label: "同行者対象外（1名）" },
      ],
    },
    {
      key: "guestTotal",
      label: "宿泊人数",
      options: [
        { value: "不定", label: "人数不定" },
        { value: "不一致", label: "人数不一致" },
        { value: "確定", label: "人数確定" },
      ],
    },
    {
      key: "completionEmail",
      label: CONTACT_LABELS.filterFieldLabel,
      options: [
        {
          value: CONTACT_LABELS.filterPending,
          label: CONTACT_LABELS.filterPending,
        },
        {
          value: CONTACT_LABELS.filterDone,
          label: CONTACT_LABELS.filterDone,
        },
      ],
    },
  ];
}
