"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createManualReservationAction } from "@/lib/actions/reservations";

const STATUS_OPTIONS = ["仮予約", "確定"] as const;
const initialState = { ok: true } as { ok: true } | { ok: false; message: string };

export function ManualReservationForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (
      prev: { ok: true } | { ok: false; message: string },
      formData: FormData
    ) => {
      const result = await createManualReservationAction(prev, formData);
      if (result.ok && result.reservationId) {
        router.push(
          `/reservations/${encodeURIComponent(result.reservationId)}`
        );
      }
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">姓 *</span>
          <input
            name="last_name"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">名</span>
          <input
            name="first_name"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-zinc-600">
            代表者名（団体名など。空欄時は姓名を使用）
          </span>
          <input
            name="representative_name"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">チェックイン *</span>
          <input
            type="date"
            name="check_in"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">チェックアウト *</span>
          <input
            type="date"
            name="check_out"
            required
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">ステータス</span>
          <select
            name="status"
            defaultValue="確定"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">宿泊人数</span>
          <input
            name="guest_total"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">メール</span>
          <input
            name="email"
            type="email"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">電話</span>
          <input
            name="phone"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">内部メモ</span>
        <textarea
          name="internal_memo"
          rows={3}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2"
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
        {isPending ? "作成中..." : "手動予約を作成（MANUAL-MT）"}
      </button>
    </form>
  );
}
