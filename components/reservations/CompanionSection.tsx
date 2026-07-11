"use client";

import { useActionState } from "react";
import {
  addCompanionAction,
  deleteCompanionAction,
} from "@/lib/actions/companions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatCompanionAgeDisplay } from "@/lib/utils/companion-age";

type Companion = {
  id: string;
  entry_no: number;
  name: string;
  name_kana: string | null;
  age: string | null;
  gender: string | null;
  source: string;
};

type Props = {
  reservationId: string;
  companions: Companion[];
  companionFormAnswered: boolean;
  tableMissing?: boolean;
};

const GENDER_OPTIONS = ["男性", "女性", "その他", "回答しない"] as const;
const initialState = { ok: true } as const;

export function CompanionSection({
  reservationId,
  companions,
  companionFormAnswered,
  tableMissing = false,
}: Props) {
  const [addState, addAction, addPending] = useActionState(
    addCompanionAction,
    initialState
  );

  return (
    <div>
      <p className="detail-hint">
        回答状況: {companionFormAnswered ? "回答済" : "未回答"}（
        {companions.length} 名）
      </p>
      {tableMissing ? (
        <p className="detail-hint">
          同行者テーブル（companions）が未作成です。Supabase で migration
          003_companions.sql を適用してください。
        </p>
      ) : null}

      {companions.length > 0 ? (
        <ul className="room-assignment-list">
          {companions.map((c) => (
            <CompanionRow
              key={c.id}
              companion={c}
              reservationId={reservationId}
            />
          ))}
        </ul>
      ) : (
        <p className="detail-empty-note">同行者は未登録です。</p>
      )}

      <div className="room-assignment-add">
        <h3 className="form-section-label" style={{ marginTop: 0 }}>
          同行者を手動追加
        </h3>
        <form action={addAction}>
          <input type="hidden" name="reservation_id" value={reservationId} />
          <div className="form-group">
            <label htmlFor="companion-name">氏名</label>
            <Input id="companion-name" name="name" required />
          </div>
          <div className="form-group">
            <label htmlFor="companion-kana">ふりがな</label>
            <Input id="companion-kana" name="name_kana" />
          </div>
          <div className="form-group">
            <label htmlFor="companion-age">年齢</label>
            <Input
              id="companion-age"
              name="age"
              type="number"
              min={0}
              max={120}
              step={1}
              inputMode="numeric"
              placeholder="0〜120"
            />
          </div>
          <div className="form-group">
            <label htmlFor="companion-gender">性別</label>
            <Select id="companion-gender" name="gender">
              <option value="">—</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>
          {addState.ok === false ? (
            <p className="detail-hint" style={{ color: "#b91c1c" }}>
              {addState.message}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={addPending}>
            {addPending ? "追加中..." : "同行者を追加"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function CompanionRow({
  companion,
  reservationId,
}: {
  companion: Companion;
  reservationId: string;
}) {
  const [state, action, pending] = useActionState(
    deleteCompanionAction,
    initialState
  );

  return (
    <li className="companion-line">
      <div className="detail-actions" style={{ marginTop: 0, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <strong>
            {companion.entry_no}. {companion.name}
          </strong>
          <div className="detail-hint" style={{ margin: "2px 0 0" }}>
            {companion.name_kana || "—"} /{" "}
            {formatCompanionAgeDisplay(companion.age) || "—"} /{" "}
            {companion.gender || "—"} / {companion.source}
          </div>
        </div>
        <form action={action}>
          <input type="hidden" name="companion_id" value={companion.id} />
          <input type="hidden" name="reservation_id" value={reservationId} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={pending}
          >
            削除
          </Button>
        </form>
      </div>
      {state.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : null}
    </li>
  );
}
