"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  batchRoomAssignmentChangesAction,
  type RoomAssignmentBatchChange,
} from "@/lib/actions/room-assignments";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  GUEST_COUNT_OPTIONS,
  optionsWithCurrent,
} from "@/lib/config/field-options";
import {
  formatGuestCompact,
  parseGuestCountFromText,
} from "@/lib/utils/guest-display";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type RoomOption = { room_id: string; room_name: string; sort_order?: number };

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
  updated_at?: string | null;
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

type DraftRow = {
  key: string;
  roomAssignmentId: string | null;
  roomId: string;
  roomName: string;
  expectedUpdatedAt: string | null;
  male: number;
  female: number;
  boy: number;
  girl: number;
  age3: number;
  under3: number;
};

type CountField = "male" | "female" | "boy" | "girl" | "age3" | "under3";

function n(value: number | null | undefined): number {
  return Number(value) || 0;
}

/** 割当・残人数の計算用（3歳未満+N は含めない） */
function rowSumForAssign(row: DraftRow): number {
  return row.male + row.female + row.boy + row.girl + row.age3;
}

function rowGuestSource(row: DraftRow) {
  const main = rowSumForAssign(row);
  return {
    guest_total: main > 0 ? String(main) : null,
    adult_male: String(row.male),
    adult_female: String(row.female),
    boy_student: String(row.boy),
    girl_student: String(row.girl),
    age_3plus: String(row.age3),
    under_3: String(row.under3),
  };
}

function guestDefaultsFromSource(source: Props["guestSource"]): Omit<
  DraftRow,
  "key" | "roomAssignmentId" | "roomId" | "roomName" | "expectedUpdatedAt"
> {
  return {
    male: Number(source.adult_male) || 0,
    female: Number(source.adult_female) || 0,
    boy: Number(source.boy_student) || 0,
    girl: Number(source.girl_student) || 0,
    age3: Number(source.age_3plus) || 0,
    under3: Number(source.under_3) || 0,
  };
}

function toDraftRows(
  assignments: Assignment[],
  rooms: RoomOption[]
): DraftRow[] {
  const roomOrder = new Map(
    rooms.map((r, i) => [r.room_id, r.sort_order ?? i])
  );
  return assignments
    .filter((a) => a.room_id)
    .map((a) => ({
      key: a.room_assignment_id,
      roomAssignmentId: a.room_assignment_id,
      roomId: a.room_id as string,
      roomName: a.room_name || a.room_id || "—",
      expectedUpdatedAt: a.updated_at ?? null,
      male: n(a.male_count),
      female: n(a.female_count),
      boy: n(a.boy_student_count),
      girl: n(a.girl_student_count),
      age3:
        a.age_3plus_count != null ? n(a.age_3plus_count) : n(a.child_count),
      under3: n(a.under_3_count),
    }))
    .sort(
      (a, b) =>
        (roomOrder.get(a.roomId) ?? 999) - (roomOrder.get(b.roomId) ?? 999)
    );
}

function CountSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const current = value > 0 ? String(value) : "";
  const options = optionsWithCurrent(GUEST_COUNT_OPTIONS, current);
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <Select
        id={id}
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v ? Number(v) || 0 : 0);
        }}
      >
        <option value="">0</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </div>
  );
}

function AssignmentStatusBadge({
  status,
  hasRooms,
  remaining,
}: {
  status: string | null;
  hasRooms: boolean;
  remaining: number;
}) {
  if (status === "割当済") {
    return <span className="badge badge-ok">部屋割当済</span>;
  }
  if (hasRooms && remaining !== 0) {
    return <span className="badge badge-warn">人数未一致</span>;
  }
  return <span className="badge badge-warn">部屋未割当</span>;
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<DraftRow[]>(() =>
    toDraftRows(assignments, rooms)
  );
  const [baseline, setBaseline] = useState(() =>
    toDraftRows(assignments, rooms)
  );

  const assignmentSig = assignments
    .map((a) => `${a.room_assignment_id}:${a.updated_at ?? ""}`)
    .join("|");

  useEffect(() => {
    const next = toDraftRows(assignments, rooms);
    setRows(next);
    setBaseline(next);
    // assignments / rooms はサーバー再取得のたびに差し替わる
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignmentSig で同期
  }, [assignmentSig]);

  const sortedRooms = useMemo(
    () =>
      [...rooms].sort(
        (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)
      ),
    [rooms]
  );

  const assignedRoomIds = useMemo(
    () => new Set(rows.map((r) => r.roomId)),
    [rows]
  );

  const nextRoom = sortedRooms.find((r) => !assignedRoomIds.has(r.room_id));
  const canAdd = Boolean(nextRoom);

  const guestTotalLabel = formatGuestCompact(guestSource);
  const guestTarget = parseGuestCountFromText(guestSource.guest_total);
  const assignedTotal = rows.reduce((sum, row) => sum + rowSumForAssign(row), 0);
  const remaining = guestTarget - assignedTotal;
  const assignedLabel = formatGuestCompact({
    guest_total: assignedTotal > 0 ? String(assignedTotal) : null,
    adult_male: String(rows.reduce((s, r) => s + r.male, 0)),
    adult_female: String(rows.reduce((s, r) => s + r.female, 0)),
    boy_student: String(rows.reduce((s, r) => s + r.boy, 0)),
    girl_student: String(rows.reduce((s, r) => s + r.girl, 0)),
    age_3plus: String(rows.reduce((s, r) => s + r.age3, 0)),
    under_3: String(rows.reduce((s, r) => s + r.under3, 0)),
  });

  function addRoom() {
    if (!nextRoom) return;
    // 1部屋目だけ予約人数で初期入力。2部屋目以降は 0（部屋割ボードと同じ）
    const defaults =
      rows.length === 0
        ? guestDefaultsFromSource(guestSource)
        : {
            male: 0,
            female: 0,
            boy: 0,
            girl: 0,
            age3: 0,
            under3: 0,
          };
    setRows((prev) => [
      ...prev,
      {
        key: `new-${nextRoom.room_id}-${Date.now()}`,
        roomAssignmentId: null,
        roomId: nextRoom.room_id,
        roomName: nextRoom.room_name,
        expectedUpdatedAt: null,
        ...defaults,
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function patchRow(key: string, field: CountField, value: number) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r))
    );
  }

  function changeRoom(key: string, roomId: string) {
    const room = sortedRooms.find((r) => r.room_id === roomId);
    if (!room) return;
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? { ...r, roomId: room.room_id, roomName: room.room_name }
          : r
      )
    );
  }

  function buildChanges(): RoomAssignmentBatchChange[] {
    const changes: RoomAssignmentBatchChange[] = [];
    const baselineById = new Map(
      baseline
        .filter((b) => b.roomAssignmentId)
        .map((b) => [b.roomAssignmentId as string, b])
    );
    const keptIds = new Set(
      rows
        .map((r) => r.roomAssignmentId)
        .filter((id): id is string => Boolean(id))
    );

    for (const old of baseline) {
      if (old.roomAssignmentId && !keptIds.has(old.roomAssignmentId)) {
        changes.push({
          type: "unassign",
          roomAssignmentId: old.roomAssignmentId,
          reservationId,
          expectedUpdatedAt: old.expectedUpdatedAt,
        });
      }
    }

    for (const row of rows) {
      // assigned_guest_count も割当判定と同様に 3歳未満を含めない
      const guestCount = rowSumForAssign(row);
      const childCount = row.boy + row.girl + row.age3 + row.under3;
      const payloadBase = {
        startDate: checkIn,
        endDate: checkOut,
        guestCount,
        maleCount: row.male,
        femaleCount: row.female,
        boyStudent: row.boy,
        girlStudent: row.girl,
        age3plus: row.age3,
        under3: row.under3,
        childCount,
      };

      if (!row.roomAssignmentId) {
        changes.push({
          type: "assign",
          reservationId,
          payload: {
            reservationId,
            roomId: row.roomId,
            ...payloadBase,
          },
        });
        continue;
      }

      const prev = baselineById.get(row.roomAssignmentId);
      const roomChanged = Boolean(prev && prev.roomId !== row.roomId);
      const guestsChanged =
        !prev ||
        prev.male !== row.male ||
        prev.female !== row.female ||
        prev.boy !== row.boy ||
        prev.girl !== row.girl ||
        prev.age3 !== row.age3 ||
        prev.under3 !== row.under3;
      const datesChanged =
        checkIn !== (assignments.find((a) => a.room_assignment_id === row.roomAssignmentId)?.stay_start ?? checkIn) ||
        checkOut !==
          (assignments.find((a) => a.room_assignment_id === row.roomAssignmentId)
            ?.stay_end ?? checkOut);

      if (guestsChanged || datesChanged || roomChanged) {
        changes.push({
          type: "update",
          roomAssignmentId: row.roomAssignmentId,
          reservationId,
          expectedUpdatedAt: row.expectedUpdatedAt,
          payload: {
            ...payloadBase,
            ...(roomChanged ? { roomId: row.roomId } : {}),
          },
        });
      }
    }

    return changes;
  }

  function save() {
    const changes = buildChanges();
    if (!changes.length) {
      showSuccessToast("変更はありません");
      return;
    }
    startTransition(async () => {
      let result = await batchRoomAssignmentChangesAction(changes, false);
      if (!result.ok && result.needsConfirm) {
        if (!confirm(result.message)) return;
        result = await batchRoomAssignmentChangesAction(changes, true);
      }
      if (!result.ok) {
        showErrorToast(result.message);
        return;
      }
      showSuccessToast("部屋割りを保存しました");
      router.refresh();
    });
  }

  const countFields: { field: CountField; label: string }[] = [
    { field: "male", label: "男" },
    { field: "female", label: "女" },
    { field: "boy", label: "小男" },
    { field: "girl", label: "小女" },
    { field: "age3", label: "幼" },
    { field: "under3", label: "+未就" },
  ];

  return (
    <div className="detail-block room-manage-block" id="room-manage-block">
      <div className="room-assign-heading">
        <h3>部屋割り</h3>
        <AssignmentStatusBadge
          status={assignmentStatus}
          hasRooms={rows.length > 0}
          remaining={remaining}
        />
      </div>
      <p
        className={
          remaining < 0
            ? "room-assign-summary room-assign-summary-over"
            : "room-assign-summary"
        }
      >
        宿泊人数 {guestTotalLabel === "—" ? "—" : `${guestTotalLabel}人`}中
        {" / "}
        割当済 {assignedLabel === "—" ? "0" : assignedLabel}人 / あと{" "}
        {remaining}人
      </p>

      {!rows.length ? (
        <p className="empty room-assign-empty">未割当（＋で部屋を追加）</p>
      ) : (
        <div className="room-assign-draft-list">
          {rows.map((row) => {
            const roomChoices = sortedRooms.filter(
              (r) => r.room_id === row.roomId || !assignedRoomIds.has(r.room_id)
            );
            return (
              <div key={row.key} className="room-assign-draft-row">
                <div className="room-assign-draft-head">
                  <label className="room-assign-room-field">
                    <span className="sr-only">部屋</span>
                    <Select
                      className="room-assign-room-select"
                      value={row.roomId}
                      disabled={pending}
                      onChange={(e) => changeRoom(row.key, e.target.value)}
                      aria-label="部屋を変更"
                    >
                      {roomChoices.map((r) => (
                        <option key={r.room_id} value={r.room_id}>
                          {r.room_name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <span className="room-assign-draft-sub">
                    {formatGuestCompact(rowGuestSource(row))}人
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="room-assign-remove-btn"
                    aria-label={`${row.roomName}を外す`}
                    onClick={() => removeRow(row.key)}
                    disabled={pending}
                  >
                    −
                  </Button>
                </div>
                <div className="room-guest-grid">
                  {countFields.map(({ field, label }) => (
                    <CountSelect
                      key={field}
                      id={`${row.key}-${field}`}
                      label={label}
                      value={row[field]}
                      onChange={(v) => patchRow(row.key, field, v)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="detail-actions room-assign-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addRoom}
          disabled={!canAdd || pending}
          title={
            canAdd
              ? `${nextRoom?.room_name ?? "部屋"}を追加`
              : "追加できる部屋がありません"
          }
        >
          ＋ 部屋を追加
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? "保存中…" : "部屋割りを保存"}
        </Button>
      </div>
    </div>
  );
}
