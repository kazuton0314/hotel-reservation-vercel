"use client";

import { useActionState } from "react";
import { updateMailFlagsAction } from "@/lib/actions/reservations";

type Props = {
  reservationId: string;
  completionEmailSent: boolean;
  day11EmailSent: boolean;
  day3EmailSent: boolean;
  completionEmailSentAt: string | null;
  day11EmailSentAt: string | null;
  day3EmailSentAt: string | null;
};

const initialState = { ok: true } as const;

function formatSentAt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP");
}

export function MailStatusForm(props: Props) {
  const [state, formAction, isPending] = useActionState(
    updateMailFlagsAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reservation_id" value={props.reservationId} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="completion_email_sent"
          defaultChecked={props.completionEmailSent}
        />
        <span>
          予約完了メール送付済
          {props.completionEmailSentAt
            ? `（${formatSentAt(props.completionEmailSentAt)}）`
            : ""}
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="day11_email_sent"
          defaultChecked={props.day11EmailSent}
        />
        <span>
          11日前メール送付済
          {props.day11EmailSentAt
            ? `（${formatSentAt(props.day11EmailSentAt)}）`
            : ""}
        </span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="day3_email_sent"
          defaultChecked={props.day3EmailSent}
        />
        <span>
          3日前メール送付済
          {props.day3EmailSentAt
            ? `（${formatSentAt(props.day3EmailSentAt)}）`
            : ""}
        </span>
      </label>

      <p className="text-xs text-zinc-500">
        SMTP送信は未実装。送付フラグの手動更新のみ（さくら SMTP 連携は今後）。
      </p>

      {state.ok === false ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60"
      >
        {isPending ? "保存中..." : "メールフラグを保存"}
      </button>
    </form>
  );
}
