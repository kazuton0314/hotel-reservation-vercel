"use client";

import type { ReservationListItem } from "@/lib/queries/reservations";
import { buildReservationMailKindStatus } from "@/lib/utils/mail-kind-status";
import { SetupContactStatusSelect } from "@/components/setup/SetupContactStatusSelect";
import type { ReservationSetupEditable } from "@/lib/services/setup-diff";

type MailKind = "予約確定" | "11日前" | "3日前";

const MAIL_COLUMNS: {
  kind: MailKind;
  field: "completion_email_sent" | "day11_email_sent" | "day3_email_sent";
}[] = [
  { kind: "予約確定", field: "completion_email_sent" },
  { kind: "11日前", field: "day11_email_sent" },
  { kind: "3日前", field: "day3_email_sent" },
];

function mailContextFrom(
  source: ReservationListItem,
  row: ReservationSetupEditable
) {
  return {
    status: row.status,
    email: source.email,
    check_in: row.check_in,
    check_out: row.check_out,
    created_at: source.created_at,
    sheet_created_at: source.sheet_created_at,
    completion_email_sent: row.completion_email_sent,
    day11_email_sent: row.day11_email_sent,
    day3_email_sent: row.day3_email_sent,
    companion_form_answered: source.companion_form_answered,
    guest_total: row.guest_total,
    adult_male: row.adult_male,
    adult_female: row.adult_female,
    boy_student: row.boy_student,
    girl_student: row.girl_student,
    age_3plus: row.age_3plus,
    under_3: row.under_3,
  };
}

type Props = {
  source: ReservationListItem;
  row: ReservationSetupEditable;
  onChange: (
    field: (typeof MAIL_COLUMNS)[number]["field"],
    sent: boolean
  ) => void;
};

export function SetupReservationMailCells({ source, row, onChange }: Props) {
  const mailRow = mailContextFrom(source, row);

  return (
    <>
      {MAIL_COLUMNS.map(({ kind, field }) => {
        const st = buildReservationMailKindStatus(mailRow, kind);
        const editable = row.status === "確定";
        const title = st.sentAtStr || st.reason || undefined;

        return (
          <td key={field} className="setup-col-contact">
            <SetupContactStatusSelect
              sent={row[field]}
              disabled={!editable}
              title={title}
              onChange={(sent) => onChange(field, sent)}
            />
          </td>
        );
      })}
    </>
  );
}

export const RESERVATION_MAIL_COLUMN_LABELS = ["予約確定", "11日前", "3日前"] as const;
