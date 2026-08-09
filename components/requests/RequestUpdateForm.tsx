"use client";

import { useActionState, useEffect, useState } from "react";
import { updateRequestAction } from "@/lib/actions/requests";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { REQUEST_STATUS_EDIT_OPTIONS } from "@/lib/config/field-options";
import { displayRequestStatus, isApprovedRequestStatus } from "@/lib/domain/request-status";

type Props = {
  requestId: string;
  status: string;
  internalMemo: string | null;
  linkedReservationId: string | null;
};

const initialState = { ok: true } as const;

export function RequestUpdateForm(props: Props) {
  const [state, formAction, isPending] = useActionState(
    updateRequestAction,
    initialState
  );

  const displayStatus = displayRequestStatus(props.status);
  // 承認済かつリンクありのときだけステータス変更をロック
  const isApprovedLocked =
    isApprovedRequestStatus(props.status) && Boolean(props.linkedReservationId);
  const [selectedStatus, setSelectedStatus] = useState(displayStatus);
  const [statusSelectKey, setStatusSelectKey] = useState(0);
  const showProvisionalOption =
    !props.linkedReservationId &&
    !isApprovedLocked &&
    selectedStatus === "承認済";
  const [createProvisional, setCreateProvisional] = useState(false);

  // React 19: form action 後に select 表示だけ戻る不具合の回復
  useEffect(() => {
    const form = document.getElementById("req-status-edit")?.closest("form");
    if (!form) return;
    const recover = () => {
      window.setTimeout(() => setStatusSelectKey((k) => k + 1), 0);
    };
    form.addEventListener("submit", recover);
    return () => form.removeEventListener("submit", recover);
  }, []);

  return (
    <form action={formAction}>
      <input type="hidden" name="request_id" value={props.requestId} />
      {props.linkedReservationId ? (
        <input
          type="hidden"
          name="linked_reservation_id"
          value={props.linkedReservationId}
        />
      ) : null}
      {showProvisionalOption && createProvisional ? (
        <input type="hidden" name="create_provisional" value="true" />
      ) : null}

      <p className="form-section-label">ステータス</p>
      <div className="form-group">
        <label htmlFor="req-status-edit">ステータス</label>
        <input type="hidden" name="status" value={selectedStatus} />
        <Select
          key={`req-status:${statusSelectKey}`}
          id="req-status-edit"
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            if (e.target.value !== "承認済") setCreateProvisional(false);
          }}
        >
          {isApprovedLocked ? (
            <option value="承認済" disabled>
              承認済
            </option>
          ) : null}
          {REQUEST_STATUS_EDIT_OPTIONS.map((status) => (
            <option
              key={status}
              value={status}
              disabled={isApprovedLocked && status !== "承認済"}
            >
              {status}
            </option>
          ))}
        </Select>
      </div>

      {showProvisionalOption ? (
        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={createProvisional}
              onChange={(e) => setCreateProvisional(e.target.checked)}
            />
            承認と同時に仮予約を作成する
          </label>
        </div>
      ) : null}

      <p className="form-section-label">メモ</p>
      <div className="form-group">
        <label htmlFor="internal-memo">運用メモ</label>
        <Textarea
          id="internal-memo"
          name="internal_memo"
          rows={4}
          defaultValue={props.internalMemo ?? ""}
          placeholder="特別な事情・配慮が必要なケース"
        />
      </div>

      {state.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : state.ok === true && !isPending ? (
        <p className="detail-hint" style={{ color: "#047857" }}>
          保存しました
        </p>
      ) : null}

      <div className="form-actions-sticky">
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : "保存"}
        </Button>
      </div>
    </form>
  );
}
