"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { batchRoomAssignmentChangesAction } from "@/lib/actions/room-assignments";
import type { GuestDefaults } from "@/components/reservations/RoomGuestFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RoomOption = { room_id: string; room_name: string };

type Props = {
  reservationId: string;
  checkIn: string;
  checkOut: string;
  guestDefaults: GuestDefaults;
  rooms: RoomOption[];
  assignedRoomIds: string[];
};

export function RoomBulkAddModal({
  open,
  onClose,
  reservationId,
  checkIn,
  checkOut,
  guestDefaults,
  rooms,
  assignedRoomIds,
}: Props & { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const available = rooms.filter((r) => !assignedRoomIds.includes(r.room_id));

  if (!open) return null;

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const start = String(fd.get("stay_start") ?? "").trim();
    const end = String(fd.get("stay_end") ?? "").trim();
    const selected = fd.getAll("room_id").map(String).filter(Boolean);
    if (!selected.length) {
      setError("部屋を1つ以上選択してください");
      return;
    }
    setError(null);
    const payload = {
      guestCount: guestDefaults.guestTotal,
      maleCount: guestDefaults.maleCount,
      femaleCount: guestDefaults.femaleCount,
      boyStudent: guestDefaults.boyStudent,
      girlStudent: guestDefaults.girlStudent,
      age3plus: guestDefaults.age3plus,
      under3: guestDefaults.under3,
      childCount:
        guestDefaults.boyStudent +
        guestDefaults.girlStudent +
        guestDefaults.age3plus +
        guestDefaults.under3,
    };
    const changes = selected.map((roomId) => ({
      type: "assign" as const,
      reservationId,
      payload: {
        reservationId,
        roomId,
        startDate: start,
        endDate: end,
        ...payload,
      },
    }));
    startTransition(async () => {
      const res = await batchRoomAssignmentChangesAction(changes);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="mail-modal-overlay" role="presentation" onClick={onClose}>
      <form
        className="mail-modal mail-modal-wide"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <h3 className="mail-modal-title">複数部屋を一括追加</h3>
        <div className="form-group">
          <label htmlFor="ra-bulk-start">開始</label>
          <Input
            id="ra-bulk-start"
            name="stay_start"
            type="date"
            defaultValue={checkIn}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="ra-bulk-end">終了</label>
          <Input
            id="ra-bulk-end"
            name="stay_end"
            type="date"
            defaultValue={checkOut}
            required
          />
        </div>
        <div className="occ-bulk-room-toolbar">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              document
                .querySelectorAll<HTMLInputElement>(".occ-bulk-room-cb")
                .forEach((cb) => {
                  cb.checked = true;
                });
            }}
          >
            すべて選択
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              document
                .querySelectorAll<HTMLInputElement>(".occ-bulk-room-cb")
                .forEach((cb) => {
                  cb.checked = false;
                });
            }}
          >
            選択解除
          </Button>
        </div>
        <div className="occ-bulk-room-list">
          {available.length === 0 ? (
            <p className="empty">追加できる部屋がありません</p>
          ) : (
            available.map((room) => (
              <label key={room.room_id} className="occ-bulk-room-item">
                <input
                  type="checkbox"
                  className="occ-bulk-room-cb"
                  name="room_id"
                  value={room.room_id}
                />
                {room.room_name}
              </label>
            ))
          )}
        </div>
        <p className="form-hint">
          予約人数（{guestDefaults.guestTotal || "—"}名）を各部屋に割り当てます
        </p>
        {error ? <p className="detail-hint" style={{ color: "#b91c1c" }}>{error}</p> : null}
        <div className="mail-modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="submit"
            disabled={pending || !available.length}
          >
            {pending ? "反映中…" : "一括追加"}
          </Button>
        </div>
      </form>
    </div>
  );
}
