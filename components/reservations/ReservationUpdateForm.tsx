"use client";

import { useActionState } from "react";
import { updateReservationAction } from "@/lib/actions/reservations";

const STATUS_OPTIONS = ["仮予約", "確定", "キャンセル"] as const;
const PAYMENT_OPTIONS = ["未払い", "支払済", "一部支払"] as const;

type Props = {
  reservationId: string;
  status: string;
  channel: string | null;
  groupType: string | null;
  groupName: string | null;
  lastName: string | null;
  firstName: string | null;
  lastNameKana: string | null;
  firstNameKana: string | null;
  email: string | null;
  phone: string | null;
  phoneAvailable: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  arrivalTime: string | null;
  transport: string | null;
  meal: string | null;
  bbq: string | null;
  inquiry: string | null;
  internalMemo: string | null;
  paymentStatus: string | null;
};

const initialState = { ok: true } as const;

export function ReservationUpdateForm(props: Props) {
  const [state, formAction, isPending] = useActionState(
    updateReservationAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reservation_id" value={props.reservationId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">ステータス</span>
          <select
            name="status"
            defaultValue={props.status}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">支払状況</span>
          <select
            name="payment_status"
            defaultValue={props.paymentStatus ?? "未払い"}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
          >
            {PAYMENT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">姓</span>
          <input
            name="last_name"
            defaultValue={props.lastName ?? ""}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">名</span>
          <input
            name="first_name"
            defaultValue={props.firstName ?? ""}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">姓ふりがな</span>
          <input
            name="last_name_kana"
            defaultValue={props.lastNameKana ?? ""}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">名ふりがな</span>
          <input
            name="first_name_kana"
            defaultValue={props.firstNameKana ?? ""}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">チェックイン</span>
          <input
            type="date"
            name="check_in"
            defaultValue={props.checkIn ?? ""}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">チェックアウト</span>
          <input
            type="date"
            name="check_out"
            defaultValue={props.checkOut ?? ""}
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
            defaultValue={props.email ?? ""}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-600">電話</span>
          <input
            name="phone"
            defaultValue={props.phone ?? ""}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">宿泊人数</span>
        <input
          name="guest_total"
          defaultValue={props.guestTotal ?? ""}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-zinc-600">内部メモ</span>
        <textarea
          name="internal_memo"
          rows={4}
          defaultValue={props.internalMemo ?? ""}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2"
        />
      </label>

      {state.ok === false ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </p>
      ) : state.ok === true && !isPending ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          保存しました
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {isPending ? "保存中..." : "予約を更新"}
      </button>
    </form>
  );
}
