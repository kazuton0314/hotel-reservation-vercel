"use client";

import { useActionState } from "react";
import {
  addReservationChargeAction,
  deleteReservationChargeAction,
  updateReservationChargeAction,
} from "@/lib/actions/reservation-charges";
import { RESERVATION_CHARGE_CATEGORY_OPTIONS } from "@/lib/config/field-options";
import type { ReservationChargeItem } from "@/lib/queries/reservation-charges";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

type Props = {
  reservationId: string;
  charges: ReservationChargeItem[];
  tableMissing?: boolean;
};

const initialState = { ok: true } as const;
const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function ChargeFields({ charge }: { charge?: ReservationChargeItem }) {
  return (
    <div className="charge-fields">
      <div className="form-group">
        <label>料金種別</label>
        <Select name="category" defaultValue={charge?.category ?? "宿泊料金"}>
          {RESERVATION_CHARGE_CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      </div>
      <div className="form-group">
        <label>補足</label>
        <Input
          name="label"
          defaultValue={charge?.label ?? ""}
          placeholder="例：大人、20%キャンセル"
        />
      </div>
      <div className="form-group">
        <label>単価（円）</label>
        <Input
          name="unit_price"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          required
          defaultValue={charge?.unit_price ?? ""}
        />
      </div>
      <div className="form-group">
        <label>数量・時間</label>
        <Input
          name="quantity"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          required
          defaultValue={charge?.quantity ?? 1}
        />
      </div>
    </div>
  );
}

export function ReservationChargesSection({
  reservationId,
  charges,
  tableMissing = false,
}: Props) {
  const [addState, addAction, addPending] = useActionState(
    addReservationChargeAction,
    initialState
  );
  const total = charges.reduce((sum, charge) => sum + charge.subtotal, 0);

  return (
    <div>
      {tableMissing ? (
        <p className="detail-hint">
          料金明細テーブルが未作成です。migration 020 を適用してください。
        </p>
      ) : null}

      {charges.length ? (
        <ul className="room-assignment-list charge-list">
          {charges.map((charge) => (
            <ChargeRow key={charge.id} reservationId={reservationId} charge={charge} />
          ))}
        </ul>
      ) : (
        <p className="detail-empty-note">料金明細は未登録です。</p>
      )}

      <div className="charge-total">
        <span>合計</span>
        <strong>{yen.format(total)}</strong>
      </div>

      {!tableMissing ? (
        <div className="room-assignment-add">
          <h3 className="form-section-label" style={{ marginTop: 0 }}>料金を追加</h3>
          <form action={addAction}>
            <input type="hidden" name="reservation_id" value={reservationId} />
            <ChargeFields />
            {addState.ok === false ? (
              <p className="detail-hint form-error">{addState.message}</p>
            ) : null}
            <Button type="submit" size="sm" disabled={addPending}>
              {addPending ? "追加中..." : "料金を追加"}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function ChargeRow({
  reservationId,
  charge,
}: {
  reservationId: string;
  charge: ReservationChargeItem;
}) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateReservationChargeAction,
    initialState
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteReservationChargeAction,
    initialState
  );

  return (
    <li className="room-assignment-item charge-item">
      <form action={updateAction}>
        <input type="hidden" name="charge_id" value={charge.id} />
        <input type="hidden" name="reservation_id" value={reservationId} />
        <ChargeFields charge={charge} />
        <div className="charge-line-summary">
          <span>{charge.source}</span>
          <strong>小計 {yen.format(charge.subtotal)}</strong>
        </div>
        {updateState.ok === false ? (
          <p className="detail-hint form-error">{updateState.message}</p>
        ) : null}
        <Button type="submit" size="sm" disabled={updatePending}>
          {updatePending ? "保存中..." : "変更を保存"}
        </Button>
      </form>
      <form action={deleteAction} className="charge-delete-form">
        <input type="hidden" name="charge_id" value={charge.id} />
        <input type="hidden" name="reservation_id" value={reservationId} />
        <Button type="submit" variant="danger" size="sm" disabled={deletePending}>
          {deletePending ? "削除中..." : "削除"}
        </Button>
      </form>
      {deleteState.ok === false ? (
        <p className="detail-hint form-error">{deleteState.message}</p>
      ) : null}
    </li>
  );
}
