"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  createRoomAssignmentAction,
  deleteRoomAssignmentAction,
  updateRoomAssignmentAction,
} from "@/lib/actions/room-assignments";
import {
  guestDefaultsFromReservation,
  RoomGuestFields,
  type GuestDefaults,
} from "@/components/reservations/RoomGuestFields";
import { RoomBulkAddModal } from "@/components/reservations/RoomBulkAddModal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatGuestCompact } from "@/lib/utils/guest-display";

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
  boy_student_count?: number | null;
  girl_student_count?: number | null;
  age_3plus_count?: number | null;
  under_3_count?: number | null;
  display_memo: string | null;
};

type Props = {
  reservationId: string;
  assignmentStatus: string | null;
  checkIn: string;
  checkOut: string;
  guestSource: {
    guest_total?: string | null;
    adult_male?: string | null;
    adult_female?: string | null;
    boy_student?: string | null;
    girl_student?: string | null;
    age_3plus?: string | null;
    under_3?: string | null;
  };
  rooms: RoomOption[];
  assignments: Assignment[];
};

type ActionResult =
  | { ok: true }
  | { ok: false; message: string; needsConfirm?: boolean };

const initialState: ActionResult = { ok: true };

function AssignmentStatusBadge({ status }: { status: string | null }) {
  if (status === "割当済") {
    return <span className="badge badge-ok">部屋割当済</span>;
  }
  return <span className="badge badge-warn">部屋未割当</span>;
}

function formatAssignmentGuests(a: Assignment): string {
  return formatGuestCompact({
    guest_total: a.assigned_guest_count != null ? String(a.assigned_guest_count) : null,
    adult_male: a.male_count != null ? String(a.male_count) : null,
    adult_female: a.female_count != null ? String(a.female_count) : null,
    boy_student: a.boy_student_count != null ? String(a.boy_student_count) : null,
    girl_student: a.girl_student_count != null ? String(a.girl_student_count) : null,
    age_3plus: a.age_3plus_count != null ? String(a.age_3plus_count) : null,
    under_3: a.under_3_count != null ? String(a.under_3_count) : null,
  });
}

function assignmentGuestDefaults(a: Assignment, fallback: GuestDefaults): GuestDefaults {
  return {
    guestTotal: a.assigned_guest_count ?? fallback.guestTotal,
    maleCount: a.male_count ?? fallback.maleCount,
    femaleCount: a.female_count ?? fallback.femaleCount,
    boyStudent: a.boy_student_count ?? fallback.boyStudent,
    girlStudent: a.girl_student_count ?? fallback.girlStudent,
    age3plus: a.age_3plus_count ?? a.child_count ?? fallback.age3plus,
    under3: a.under_3_count ?? fallback.under3,
  };
}

export function RoomAssignmentManager({
  reservationId,
  assignmentStatus,
  checkIn,
  checkOut,
  guestSource,
  rooms,
  assignments,
}: Props) {
  const guestDefaults = guestDefaultsFromReservation(guestSource);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [createState, createAction, createPending] = useActionState(
    createRoomAssignmentAction,
    initialState
  );
  const [forceCreate, setForceCreate] = useState(false);
  const createFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (forceCreate) createFormRef.current?.requestSubmit();
  }, [forceCreate]);

  const assignedRoomIds = assignments
    .map((a) => a.room_id)
    .filter((id): id is string => Boolean(id));

  return (
    <div className="detail-block" id="room-manage-block">
      <h3>部屋割り</h3>
      <div className="kv">
        <div className="k">状態</div>
        <div className="v">
          <AssignmentStatusBadge status={assignmentStatus} />
        </div>
      </div>

      {!assignments.length ? (
        <p className="empty" style={{ padding: "8px 0" }}>
          未割当
        </p>
      ) : (
        assignments.map((a) =>
          editId === a.room_assignment_id ? (
            <EditAssignmentForm
              key={a.room_assignment_id}
              assignment={a}
              rooms={rooms}
              guestDefaults={assignmentGuestDefaults(a, guestDefaults)}
              onCancel={() => setEditId(null)}
              onSaved={() => setEditId(null)}
            />
          ) : (
            <div key={a.room_assignment_id} className="card-row room-assignment-row">
              <span>
                {a.room_name} / {formatAssignmentGuests(a)} / {a.stay_start}〜
                {a.stay_end}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditId(a.room_assignment_id)}
              >
                編集
              </Button>
              <DeleteButton
                roomAssignmentId={a.room_assignment_id}
                reservationId={reservationId}
              />
            </div>
          )
        )
      )}

      <div className="detail-actions" style={{ marginTop: 8 }}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setShowAdd((v) => !v);
            setEditId(null);
          }}
        >
          部屋を追加
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setBulkOpen(true)}
        >
          複数部屋を一括追加
        </Button>
      </div>

      <div
        id="room-add-form"
        className={showAdd ? "" : "hidden"}
        style={{ marginTop: 10 }}
      >
        <form ref={createFormRef} action={createAction}>
          <input type="hidden" name="reservation_id" value={reservationId} />
          {forceCreate ? <input type="hidden" name="force" value="true" /> : null}
          <div className="form-group">
            <label htmlFor="ra-room">部屋</label>
            <Select id="ra-room" name="room_id" required defaultValue={rooms[0]?.room_id}>
              {rooms.map((room) => (
                <option key={room.room_id} value={room.room_id}>
                  {room.room_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="form-group">
            <label htmlFor="ra-start">開始</label>
            <Input
              id="ra-start"
              name="stay_start"
              type="date"
              defaultValue={checkIn}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="ra-end">終了</label>
            <Input
              id="ra-end"
              name="stay_end"
              type="date"
              defaultValue={checkOut}
              required
            />
          </div>
          <RoomGuestFields defaults={guestDefaults} />
          <div className="form-group">
            <label htmlFor="ra-memo">表示メモ</label>
            <Input id="ra-memo" name="display_memo" />
          </div>
          {createState.ok === false ? (
            <p className="detail-hint" style={{ color: "#b91c1c" }}>
              {createState.message}
              {createState.needsConfirm ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => setForceCreate(true)}
                >
                  確認して追加
                </Button>
              ) : null}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={createPending}
            style={{ marginTop: 8 }}
          >
            {createPending ? "追加中…" : "追加"}
          </Button>
        </form>
      </div>

      <RoomBulkAddModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        reservationId={reservationId}
        checkIn={checkIn}
        checkOut={checkOut}
        guestDefaults={guestDefaults}
        rooms={rooms}
        assignedRoomIds={assignedRoomIds}
      />
    </div>
  );
}

function DeleteButton({
  roomAssignmentId,
  reservationId,
}: {
  roomAssignmentId: string;
  reservationId: string;
}) {
  const [state, action, pending] = useActionState(
    deleteRoomAssignmentAction,
    initialState
  );
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="room_assignment_id" value={roomAssignmentId} />
      <input type="hidden" name="reservation_id" value={reservationId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending}
      >
        削除
      </Button>
      {state.ok === false ? (
        <span className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function EditAssignmentForm({
  assignment,
  rooms,
  guestDefaults,
  onCancel,
  onSaved,
}: {
  assignment: Assignment;
  rooms: RoomOption[];
  guestDefaults: GuestDefaults;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await updateRoomAssignmentAction(prev, formData);
      if (result.ok) onSaved();
      return result;
    },
    initialState
  );
  const [force, setForce] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (force) formRef.current?.requestSubmit();
  }, [force]);

  return (
    <div id="room-edit-form" style={{ marginTop: 10, marginBottom: 10 }}>
      <p className="form-hint">部屋割りを編集</p>
      <form ref={formRef} action={action}>
        <input
          type="hidden"
          name="room_assignment_id"
          value={assignment.room_assignment_id}
        />
        {force ? <input type="hidden" name="force" value="true" /> : null}
        <div className="form-group">
          <label htmlFor="ra-edit-room">部屋</label>
          <Select
            id="ra-edit-room"
            name="room_id"
            defaultValue={assignment.room_id ?? ""}
          >
            {rooms.map((room) => (
              <option key={room.room_id} value={room.room_id}>
                {room.room_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="form-group">
          <label htmlFor="ra-edit-start">開始</label>
          <Input
            id="ra-edit-start"
            name="stay_start"
            type="date"
            defaultValue={assignment.stay_start}
          />
        </div>
        <div className="form-group">
          <label htmlFor="ra-edit-end">終了</label>
          <Input
            id="ra-edit-end"
            name="stay_end"
            type="date"
            defaultValue={assignment.stay_end}
          />
        </div>
        <RoomGuestFields defaults={guestDefaults} />
        <div className="form-group">
          <label htmlFor="ra-edit-memo">表示メモ</label>
          <Input
            id="ra-edit-memo"
            name="display_memo"
            defaultValue={assignment.display_memo ?? ""}
          />
        </div>
        {state.ok === false ? (
          <p className="detail-hint" style={{ color: "#b91c1c" }}>
            {state.message}
            {state.needsConfirm ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                style={{ marginLeft: 8 }}
                onClick={() => setForce(true)}
              >
                確認して更新
              </Button>
            ) : null}
          </p>
        ) : null}
        <div className="detail-actions" style={{ marginTop: 8 }}>
          <Button
            type="submit"
            size="sm"
            disabled={pending}
          >
            {pending ? "更新中…" : "更新"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
          >
            キャンセル
          </Button>
        </div>
      </form>
    </div>
  );
}
