import type { RequestListItem } from "@/lib/queries/requests";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";

export function applyRequestListFilter(
  items: RequestListItem[],
  field?: string,
  value?: string
): RequestListItem[] {
  if (!field || !value) return items;

  if (field === "replyEmail") {
    if (
      value === CONTACT_LABELS.filterPending ||
      value === "未確認" ||
      value === "確認未完了"
    ) {
      return items.filter((r) => !r.reply_email_sent);
    }
    if (value === CONTACT_LABELS.filterDone || value === "確認済") {
      return items.filter((r) => r.reply_email_sent);
    }
  }

  return items;
}
