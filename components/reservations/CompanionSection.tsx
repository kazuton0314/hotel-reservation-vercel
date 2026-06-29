"use client";

import { useActionState } from "react";
import {
  addCompanionAction,
  deleteCompanionAction,
} from "@/lib/actions/companions";

type Companion = {
  id: string;
  entry_no: number;
  name: string;
  name_kana: string | null;
  age: string | null;
  gender: string | null;
  source: string;
};

type Props = {
  reservationId: string;
  companions: Companion[];
  companionFormAnswered: boolean;
};

const GENDER_OPTIONS = ["男性", "女性", "その他", "回答しない"] as const;
const initialState = { ok: true } as const;

export function CompanionSection({
  reservationId,
  companions,
  companionFormAnswered,
}: Props) {
  const [addState, addAction, addPending] = useActionState(
    addCompanionAction,
    initialState
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        回答状況: {companionFormAnswered ? "回答済" : "未回答"}（
        {companions.length} 名）
      </p>

      {companions.length > 0 ? (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {companions.map((c) => (
            <CompanionRow
              key={c.id}
              companion={c}
              reservationId={reservationId}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">同行者は未登録です。</p>
      )}

      <div className="rounded-lg border border-dashed border-zinc-300 p-4">
        <h3 className="text-sm font-semibold">同行者を手動追加</h3>
        <form action={addAction} className="mt-3 space-y-3">
          <input type="hidden" name="reservation_id" value={reservationId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">氏名</span>
              <input
                name="name"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">ふりがな</span>
              <input
                name="name_kana"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">年齢</span>
              <input
                name="age"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">性別</span>
              <select
                name="gender"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              >
                <option value="">未選択</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {addState.ok === false ? (
            <p className="text-sm text-red-700">{addState.message}</p>
          ) : null}
          <button
            type="submit"
            disabled={addPending}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {addPending ? "追加中..." : "同行者を追加"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CompanionRow({
  companion,
  reservationId,
}: {
  companion: Companion;
  reservationId: string;
}) {
  const [state, action, pending] = useActionState(
    deleteCompanionAction,
    initialState
  );

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <div>
        <p className="font-medium">
          {companion.entry_no}. {companion.name}
        </p>
        <p className="text-xs text-zinc-500">
          {companion.name_kana || "—"} / {companion.age || "—"}歳 /{" "}
          {companion.gender || "—"} / {companion.source}
        </p>
      </div>
      <form action={action}>
        <input type="hidden" name="companion_id" value={companion.id} />
        <input type="hidden" name="reservation_id" value={reservationId} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-red-600 hover:underline"
        >
          削除
        </button>
      </form>
      {state.ok === false ? (
        <p className="text-xs text-red-600">{state.message}</p>
      ) : null}
    </li>
  );
}
