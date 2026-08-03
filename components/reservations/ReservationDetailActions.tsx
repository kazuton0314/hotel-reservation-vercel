"use client";

import { useOptimistic, useState, useTransition } from "react";
import { quickReservationStatusAction } from "@/lib/actions/reservations";
import { Button } from "@/components/ui/button";
import { markLocalDataMutation } from "@/lib/utils/local-mutation";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  reservationId: string;
  status: string;
  updatedAt: string | null;
};

export function ReservationDetailActions({
  reservationId,
  status,
  updatedAt,
}: Props) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(nextStatus: string) {
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      setError(null);
      markLocalDataMutation();
      const fd = new FormData();
      fd.set("reservation_id", reservationId);
      fd.set("status", nextStatus);
      if (updatedAt) fd.set("expected_updated_at", updatedAt);
      const result = await quickReservationStatusAction({ ok: true }, fd);
      if (!result.ok) {
        setOptimisticStatus(status);
        setError(result.message ?? "更新に失敗しました");
        showErrorToast(result.message ?? "更新に失敗しました");
        return;
      }
      showSuccessToast("ステータスを更新しました");
    });
  }

  return (
    <div className="detail-status-actions">
      <div className="detail-actions detail-actions-inline">
        {optimisticStatus === "仮予約" ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => submit("確定")}
          >
            {pending ? "更新中…" : "確定にする"}
          </Button>
        ) : optimisticStatus === "確定" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (confirm("この予約を仮予約に戻しますか？")) {
                submit("仮予約");
              }
            }}
          >
            仮予約に戻す
          </Button>
        ) : null}
        {optimisticStatus !== "キャンセル" ? (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm("この予約をキャンセルにしますか？")) {
                submit("キャンセル");
              }
            }}
          >
            キャンセルにする
          </Button>
        ) : (
          <p className="detail-hint" style={{ margin: 0 }}>
            キャンセル済みです。ステータス変更は下の編集フォームから行えます。
          </p>
        )}
      </div>
      {error ? <p className="detail-hint conflict-hint">{error}</p> : null}
    </div>
  );
}
