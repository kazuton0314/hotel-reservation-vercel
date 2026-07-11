"use client";

import { useActionState } from "react";
import { archiveRequestAction } from "@/lib/actions/requests";
import { Button } from "@/components/ui/button";

type Props = {
  requestId: string;
  isArchived: boolean;
};

const initialState = { ok: true } as { ok: true } | { ok: false; message: string };

export function ArchiveRequestButton({ requestId, isArchived }: Props) {
  const [state, formAction, isPending] = useActionState(
    archiveRequestAction,
    initialState
  );

  return (
    <form action={formAction} className="detail-block">
      <input type="hidden" name="request_id" value={requestId} />
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
