"use client";

import { useActionState } from "react";
import { updateRequestAction } from "@/lib/actions/requests";

const REQUEST_STATUS_OPTIONS = [
  "リクエスト",
  "承認済",
  "却下",
  "本予約連携済",
] as const;

type Props = {
  requestId: string;
  status: string;
  rejectReason: string | null;
  internalMemo: string | null;
  linkedReservationId: string | null;
};

const initialState = { ok: true } as const;

export function RequestUpdateForm(props: Props) {
  const [state, formAction, isPending] = useActionState(
    updateRequestAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="request_id" value={props.requestId} />

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">ステータス</span>
        <select
          name="status"
          defaultValue={props.status}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
        >
          {REQUEST_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">連携予約ID（任意）</span>
        <input
          type="text"
          name="linked_reservation_id"
          defaultValue={props.linkedReservationId ?? ""}
          placeholder="STUDIO-MT150"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">却下理由（却下時必須）</span>
        <textarea
          name="reject_reason"
          defaultValue={props.rejectReason ?? ""}
          rows={3}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">内部メモ</span>
        <textarea
          name="internal_memo"
          defaultValue={props.internalMemo ?? ""}
          rows={4}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
        />
      </label>

      {state.ok === false ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "保存中..." : "変更を保存"}
      </button>
    </form>
  );
}
