"use client";

import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";

type Props = {
  sent: boolean;
  onChange: (sent: boolean) => void;
  disabled?: boolean;
  title?: string;
};

/** 一覧設定の連絡（メール）ステータス */
export function SetupContactStatusSelect({
  sent,
  onChange,
  disabled = false,
  title,
}: Props) {
  if (disabled) {
    return (
      <span className="setup-contact-muted" title={title}>
        —
      </span>
    );
  }

  return (
    <select
      className="setup-cell setup-cell-contact"
      value={sent ? "done" : "pending"}
      title={title}
      onChange={(e) => onChange(e.target.value === "done")}
      aria-label={sent ? CONTACT_LABELS.done : CONTACT_LABELS.pending}
    >
      <option value="pending">{CONTACT_LABELS.pending}</option>
      <option value="done">{CONTACT_LABELS.done}</option>
    </select>
  );
}
