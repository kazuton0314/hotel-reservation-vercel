"use client";

import { useActionState, useState } from "react";
import {
  createRoomAssignmentAction,
  deleteRoomAssignmentAction,
  moveRoomAssignmentAction,
  updateRoomAssignmentAction,
} from "@/lib/actions/room-assignments";

type RoomOption = { room_id: string; room_name: string };

type Assignment = {
  room_assignment_id: string;
  room_id: string | null;
  room_name: string | null;
  stay_start: string;
  stay_end: string;
  assigned_guest_count: number | null;
  male_count?: number | null;
  female_count?: number | null;
  child_count?: number | null;
  display_memo: string | null;
  assignment_memo: string | null;
};

type Props = {
  reservationId: string;
  rooms: RoomOption[];
  assignments: Assignment[];
};

type ActionResult =
  | { ok: true }
  | { ok: false; message: string; needsConfirm?: boolean };

const initialState: ActionResult = { ok: true };

export function RoomAssignmentManager({
  reservationId,
  rooms,
  assignments,
}: Props) {
  const [createState, createAction, createPending] = useActionState(
    createRoomAssignmentAction,
    initialState
  );
  const [forceCreate, setForceCreate] = useState(false);

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {assignments.length === 0 ? (
          <li className="text-sm text-zinc-500">部屋割りは未登録です。</li>
        ) : (
          assignments.map((a) => (
            <AssignmentRow
              key={a.room_assignment_id}
              assignment={a}
              reservationId={reservationId}
              rooms={rooms}
            />
          ))
        )}
      </ul>

      <div className="rounded-lg border border-dashed border-zinc-300 p-4">
        <h3 className="text-sm font-semibold">部屋割りを追加</h3>
        <form action={createAction} className="mt-3 space-y-3">
          <input type="hidden" name="reservation_id" value={reservationId} />
          {forceCreate ? (
            <input type="hidden" name="force" value="true" />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">部屋</span>
              <select
                name="room_id"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              >
                <option value="">選択</option>
                {rooms.map((r) => (
                  <option key={r.room_id} value={r.room_id}>
                    {r.room_name} ({r.room_id})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">割当人数</span>
              <input
                name="assigned_guest_count"
                type="number"
                min={0}
                defaultValue={0}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">利用開始日</span>
              <input
                name="stay_start"
                type="date"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">利用終了日</span>
              <input
                name="stay_end"
                type="date"
                required
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">表示用メモ</span>
            <input
              name="display_memo"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>

          {createState.ok === false ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p>{createState.message}</p>
              {createState.ok === false && createState.needsConfirm ? (
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={forceCreate}
                    onChange={(e) => setForceCreate(e.target.checked)}
                  />
                  競合を承知のうえで割り当てる
                </label>
              ) : null}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={
              createPending ||
              (createState.ok === false &&
                createState.needsConfirm === true &&
                !forceCreate)
            }
            className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {createPending ? "追加中..." : "部屋割りを追加"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AssignmentRow({
  assignment,
  reservationId,
  rooms,
}: {
  assignment: Assignment;
  reservationId: string;
  rooms: RoomOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [moveForce, setMoveForce] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(
    updateRoomAssignmentAction,
    initialState
  );
  const [moveState, moveAction, movePending] = useActionState(
    moveRoomAssignmentAction,
    initialState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteRoomAssignmentAction,
    initialState
  );

  if (editing) {
    return (
      <li className="rounded-lg border border-zinc-200 p-3">
        <form action={updateAction} className="space-y-3">
          <input
            type="hidden"
            name="room_assignment_id"
            value={assignment.room_assignment_id}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">部屋</span>
              <select
                name="room_id"
                defaultValue={assignment.room_id ?? ""}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              >
                {rooms.map((r) => (
                  <option key={r.room_id} value={r.room_id}>
                    {r.room_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">割当人数</span>
              <input
                name="assigned_guest_count"
                type="number"
                defaultValue={assignment.assigned_guest_count ?? 0}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">開始日</span>
              <input
                name="stay_start"
                type="date"
                defaultValue={assignment.stay_start}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-600">終了日</span>
              <input
                name="stay_end"
                type="date"
                defaultValue={assignment.stay_end}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">表示用メモ</span>
            <input
              name="display_memo"
              defaultValue={assignment.display_memo ?? ""}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          {updateState.ok === false && updateState.message ? (
            <p className="text-sm text-red-700">{updateState.message}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={updatePending}
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border px-3 py-1.5 text-sm"
            >
              キャンセル
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-200 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {assignment.room_name} ({assignment.room_id})
          </p>
          <p className="text-xs text-zinc-500">
            {assignment.stay_start} ~ {assignment.stay_end}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            人数: {assignment.assigned_guest_count ?? "—"} / メモ:{" "}
            {assignment.display_memo || "なし"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-emerald-700 hover:underline"
          >
            編集
          </button>
          <form action={deleteAction}>
            <input
              type="hidden"
              name="room_assignment_id"
              value={assignment.room_assignment_id}
            />
            <button
              type="submit"
              disabled={deletePending}
              className="text-xs text-red-600 hover:underline"
            >
              削除
            </button>
          </form>
        </div>
      </div>

      <form action={moveAction} className="mt-2 flex flex-wrap items-end gap-2">
        <input
          type="hidden"
          name="room_assignment_id"
          value={assignment.room_assignment_id}
        />
        {moveForce ? <input type="hidden" name="force" value="true" /> : null}
        <label className="text-xs">
          <span className="mb-1 block text-zinc-500">部屋移動</span>
          <select
            name="new_room_id"
            defaultValue={assignment.room_id ?? ""}
            className="rounded border border-zinc-300 px-2 py-1"
          >
            {rooms.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.room_name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={movePending}
          className="rounded border border-zinc-300 px-2 py-1 text-xs"
        >
          移動
        </button>
      </form>

      {moveState.ok === false && moveState.needsConfirm ? (
        <label className="mt-1 flex items-center gap-2 text-xs text-amber-800">
          <input
            type="checkbox"
            checked={moveForce}
            onChange={(e) => setMoveForce(e.target.checked)}
          />
          競合を承知のうえで移動
        </label>
      ) : null}
      {deleteState.ok === false ? (
        <p className="mt-1 text-xs text-red-600">{deleteState.message}</p>
      ) : null}
    </li>
  );
}
