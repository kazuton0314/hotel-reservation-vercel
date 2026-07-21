import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import type { ListFilterFieldDef } from "@/components/list/ReservationListFilterBar";

/** リクエスト一覧・一覧設定で共通の絞り込み定義 */
export function buildRequestListFilterFields(): ListFilterFieldDef[] {
  return [
    {
      key: "replyEmail",
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
