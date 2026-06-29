"use client";

import { useActionState } from "react";
import { archiveReservationAction } from "@/lib/actions/reservations";

type Props = {
  reservationId: string;
  isArchived: boolean;
};

const initialState = { ok: true } as { ok: true } | { ok: false; message: string };

export function ArchiveReservationButton({
  reservationId,
  isArchived,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    archiveReservationAction,
    initialState
  );

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="reservation_id" value={reservationId} />
      <input type="hidden" name="archive" value={isArchived ? "false" : "true"} />
      {state.ok === false ? (
        <p className="mb-2 text-sm text-red-700">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${
          isArchived
            ? "border border-zinc-300 text-zinc-700"
            : "border border-red-200 bg-red-50 text-red-800"
        }`}
      >
        {isPending
          ? "処理中..."
          : isArchived
            ? "アーカイブから復元"
            : "アーカイブへ移動"}
      </button>
    </form>
  );
}
