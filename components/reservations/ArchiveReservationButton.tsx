"use client";

import { useActionState } from "react";
import { archiveReservationAction } from "@/lib/actions/reservations";
import { Button } from "@/components/ui/button";

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
    <form action={formAction} className="detail-block">
      <input type="hidden" name="reservation_id" value={reservationId} />
      <input type="hidden" name="archive" value={isArchived ? "false" : "true"} />
      {state.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={isPending}
        variant={isArchived ? "secondary" : "danger"}
      >
        {isPending
          ? "処理中…"
          : isArchived
            ? "アーカイブから復元"
            : "アーカイブへ移動"}
      </Button>
    </form>
  );
}
