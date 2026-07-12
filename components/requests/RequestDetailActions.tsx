"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  createProvisionalFromRequestAction,
  linkRequestReservationAction,
  quickRequestStatusAction,
  unlinkRequestReservationAction,
} from "@/lib/actions/requests";
import { LinkReservationPicker } from "@/components/requests/LinkReservationPicker";
import { RequestApproveDialog } from "@/components/requests/RequestApproveDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type LinkCandidate = {
  reservation_id: string;
  representative_name: string | null;
  status: string | null;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
};

type Props = {
  requestId: string;
  status: string;
  linkedReservationId: string | null;
  linkCandidates: LinkCandidate[];
  updatedAt: string | null;
};

const initialState = { ok: true } as const;

export function RequestDetailActions({
  requestId,
  status,
  linkedReservationId,
  linkCandidates,
  updatedAt,
}: Props) {
  const router = useRouter();
  const [quickPending, startQuick] = useTransition();
  const [provisionalState, provisionalAction, provisionalPending] =
    useActionState(createProvisionalFromRequestAction, initialState);
  const [unlinkState, unlinkAction, unlinkPending] = useActionState(
    unlinkRequestReservationAction,
    initialState
  );
  const [linkState, linkAction, linkPending] = useActionState(
    linkRequestReservationAction,
    initialState
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);

  const busy =
    quickPending || provisionalPending || unlinkPending || linkPending;
  const errorMessage =
    quickError ||
    (provisionalState.ok === false && provisionalState.message) ||
    (unlinkState.ok === false && unlinkState.message) ||
    (linkState.ok === false && linkState.message) ||
    null;

  const showLinkedActions =
    (status === "承認済" || status === "本予約連携済") && linkedReservationId;
  const showApprovedNoLink =
    (status === "承認済" || status === "本予約連携済") && !linkedReservationId;

  function submitQuick(
    nextStatus: string,
    reason?: string,
    createProvisional = false
  ) {
    startQuick(async () => {
      setQuickError(null);
      const fd = new FormData();
      fd.set("request_id", requestId);
      fd.set("status", nextStatus);
      if (reason) fd.set("reject_reason", reason);
      if (createProvisional) fd.set("create_provisional", "true");
      if (updatedAt) fd.set("expected_updated_at", updatedAt);
      const result = await quickRequestStatusAction({ ok: true }, fd);
      if (!result.ok) {
        setQuickError(result.message ?? "更新に失敗しました");
        showErrorToast(result.message ?? "更新に失敗しました");
        return;
      }
      showSuccessToast("ステータスを更新しました");
      setApproveOpen(false);
      setRejectOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="detail-status-actions">
      <div className="detail-actions detail-actions-inline">
        {status === "リクエスト" ? (
          <>
            <Button
              type="button"
              variant="default"
              disabled={busy}
              onClick={() => setApproveOpen(true)}
            >
              承認
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              却下
            </Button>
          </>
        ) : null}

        {showLinkedActions ? (
          <>
            <Link
              href={`/reservations/${encodeURIComponent(linkedReservationId!)}`}
              className="btn btn-secondary"
            >
              予約を見る（{linkedReservationId}）
            </Link>
            <form action={unlinkAction}>
              <input type="hidden" name="request_id" value={requestId} />
              <Button
                type="submit"
                variant="danger"
                size="sm"
                className="btn-req-unlink-res"
                disabled={busy}
                onClick={(e) => {
                  if (
                    !confirm(
                      `本予約との連携を解除しますか？\n\n予約台帳の本予約（${linkedReservationId}）は削除されません。`
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                連携を解除
              </Button>
            </form>
          </>
        ) : null}

        {showApprovedNoLink ? (
          <>
            <form action={provisionalAction}>
              <input type="hidden" name="request_id" value={requestId} />
              <Button
                type="submit"
                disabled={busy}
                onClick={(e) => {
                  if (!confirm("仮予約を予約台帳に作成しますか？")) {
                    e.preventDefault();
                  }
                }}
              >
                仮予約を作成
              </Button>
            </form>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setPickerOpen(true)}
            >
              本予約を紐づけ
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => submitQuick("リクエスト")}
            >
              リクエストに戻す
            </Button>
          </>
        ) : null}

        {status !== "リクエスト" &&
        !showLinkedActions &&
        !showApprovedNoLink ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => submitQuick("リクエスト")}
          >
            リクエストに戻す
          </Button>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {errorMessage}
        </p>
      ) : null}

      {approveOpen ? (
        <RequestApproveDialog
          open={approveOpen}
          pending={busy}
          onClose={() => setApproveOpen(false)}
          onApprove={(createProvisional) => {
            setApproveOpen(false);
            submitQuick("承認済", undefined, createProvisional);
          }}
        />
      ) : null}

      {rejectOpen ? (
        <div className="detail-status-edit">
          <label htmlFor="reject-reason">却下理由</label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="detail-actions detail-actions-inline" style={{ marginTop: 8 }}>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={busy || !rejectReason.trim()}
              onClick={() => {
                submitQuick("却下", rejectReason.trim());
              }}
            >
              却下を確定
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRejectOpen(false)}
            >
              キャンセル
            </Button>
          </div>
        </div>
      ) : null}

      {pickerOpen ? (
        <LinkReservationPicker
          candidates={linkCandidates}
          onClose={() => setPickerOpen(false)}
          onSelect={(reservationId) => {
            const fd = new FormData();
            fd.set("request_id", requestId);
            fd.set("reservation_id", reservationId);
            linkAction(fd);
            setPickerOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
