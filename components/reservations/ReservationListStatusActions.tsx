"use client";

import { useOptimistic, useTransition } from "react";
import { quickReservationStatusAction } from "@/lib/actions/reservations";
import { ReservationStatusBadge } from "@/components/list/ReservationListBadges";
import { Button } from "@/components/ui/button";
import { markLocalDataMutation } from "@/lib/utils/local-mutation";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  reservationId: string;
  status: string;
  updatedAt: string | null;
};

/** 一覧から詳細に飛ばずステータス変更（GAS E2 / F3 相当） */
export function ReservationListStatusActions({
  reservationId,
  status,
  updatedAt,
}: Props) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [pending, startTransition] = useTransition();

  function changeStatus(nextStatus: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      markLocalDataMutation();
      const fd = new FormData();
      fd.set("reservation_id", reservationId);
      fd.set("status", nextStatus);
      if (updatedAt) fd.set("expected_updated_at", updatedAt);
      const result = await quickReservationStatusAction({ ok: true }, fd);
      if (!result.ok) {
        showErrorToast(result.message ?? "更新に失敗しました");
        setOptimisticStatus(status);
        return;
      }
      showSuccessToast("ステータスを更新しました");
    });
  }

  return (
    <div
      className="list-inline-status"
      onClick={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ReservationStatusBadge status={optimisticStatus} />
      {optimisticStatus === "仮予約" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          className="list-inline-status-btn"
          onClick={() => changeStatus("確定")}
        >
          確定
        </Button>
      ) : optimisticStatus === "確定" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          className="list-inline-status-btn"
          onClick={() =>
            changeStatus("仮予約", "この予約を仮予約に戻しますか？")
          }
        >
          仮予約に戻す
        </Button>
      ) : null}
      {optimisticStatus !== "キャンセル" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          className="list-inline-status-btn list-inline-status-btn-danger"
          onClick={() =>
            changeStatus("キャンセル", "この予約をキャンセルにしますか？")
          }
        >
          キャンセル
        </Button>
      ) : null}
    </div>
  );
}
