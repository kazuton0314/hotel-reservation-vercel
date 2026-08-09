"use client";

import { useActionState, useState } from "react";
import { updateRequestAction } from "@/lib/actions/requests";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { REQUEST_STATUS_EDIT_OPTIONS } from "@/lib/config/field-options";
import { displayRequestStatus, isApprovedRequestStatus } from "@/lib/domain/request-status";
import { submitFormAction } from "@/lib/utils/submit-form-action";

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
  const showProvisionalOption =
    !props.linkedReservationId &&
    !isApprovedLocked &&
    selectedStatus === "承認済";
  const [createProvisional, setCreateProvisional] = useState(false);

  const onSubmit = submitFormAction(formAction);

  return (
    <form onSubmit={onSubmit}>
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
        <Select
          id="req-status-edit"
          name="status"
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
