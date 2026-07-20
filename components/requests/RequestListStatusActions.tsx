"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickRequestStatusAction } from "@/lib/actions/requests";
import { RequestApproveDialog } from "@/components/requests/RequestApproveDialog";
import { Button } from "@/components/ui/button";
import { displayRequestStatus, isApprovedRequestStatus } from "@/lib/domain/request-status";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type Props = {
  requestId: string;
  status: string;
  updatedAt: string | null;
};

function statusBadge(status: string) {
  const display = displayRequestStatus(status);
  let cls = "badge badge-status";
  if (display === "リクエスト") cls += " badge-status-request";
  else if (isApprovedRequestStatus(status))
    cls += " badge-confirmed badge-status-confirmed";
  else if (display === "却下") cls += " badge-cancelled badge-status-cancelled";
  return <span className={cls}>{display}</span>;
}

/** 一覧からステータス変更（承認時は仮予約作成を確認） */
export function RequestListStatusActions({
  requestId,
  status,
  updatedAt,
}: Props) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [approveOpen, setApproveOpen] = useState(false);

  function submit(nextStatus: string, createProvisional = false) {
    startTransition(async () => {
      setOptimisticStatus(nextStatus);
      const fd = new FormData();
      fd.set("request_id", requestId);
      fd.set("status", nextStatus);
      if (createProvisional) fd.set("create_provisional", "true");
      if (updatedAt) fd.set("expected_updated_at", updatedAt);
      const result = await quickRequestStatusAction({ ok: true }, fd);
      if (!result.ok) {
        showErrorToast(result.message ?? "更新に失敗しました");
        setOptimisticStatus(status);
        return;
      }
      showSuccessToast("ステータスを更新しました");
      router.refresh();
    });
  }

  function approve(createProvisional: boolean) {
    setApproveOpen(false);
    submit("承認済", createProvisional);
  }

  return (
    <div
      className="list-inline-status"
      onClick={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {statusBadge(optimisticStatus)}
      {optimisticStatus === "リクエスト" ? (
        <>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            className="list-inline-status-btn"
            onClick={() => setApproveOpen(true)}
          >
            承認
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            className="list-inline-status-btn list-inline-status-btn-danger"
            onClick={() => submit("却下")}
          >
            却下
          </Button>
        </>
      ) : null}
      <RequestApproveDialog
        open={approveOpen}
        pending={pending}
        onClose={() => setApproveOpen(false)}
        onApprove={approve}
      />
    </div>
  );
}
