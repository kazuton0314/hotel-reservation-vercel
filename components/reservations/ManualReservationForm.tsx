"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/form/DateField";
import { FormCheckboxGroup } from "@/components/form/FormCheckboxGroup";
import { FormSelectField } from "@/components/form/FormSelectField";
import { DetailBack } from "@/components/detail/DetailBack";
import { RoomGuestFields } from "@/components/reservations/RoomGuestFields";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { createManualReservationAction } from "@/lib/actions/reservations";
import {
  ARRIVAL_TIME_OPTIONS,
  BBQ_OPTIONS,
  CHANNEL_OPTIONS,
  GROUP_TYPE_OPTIONS,
  MANUAL_RESERVATION_STATUS_OPTIONS,
  MEAL_OPTIONS,
  PHONE_AVAILABLE_OPTIONS,
  REFERRAL_OPTIONS,
  SOMEN_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVEL_PURPOSE_OPTIONS,
} from "@/lib/config/field-options";
import { submitFormAction } from "@/lib/utils/submit-form-action";

const initialState = { ok: true } as { ok: true } | { ok: false; message: string };

function Fg({
  label,
  name,
  type = "text",
}: {
  label: string;
  name: string;
  type?: string;
}) {
  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <Input id={name} name={name} type={type} />
    </div>
  );
}

export function ManualReservationForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (
      prev: { ok: true } | { ok: false; message: string },
      formData: FormData
    ) => {
      const result = await createManualReservationAction(prev, formData);
      if (result.ok && result.reservationId) {
        router.push(
          `/reservations/${encodeURIComponent(result.reservationId)}`
        );
      }
      return result;
    },
    initialState
  );

  const onSubmit = submitFormAction(formAction);

  return (
    <>
      <DetailBack href="/reservations" />
      <form onSubmit={onSubmit}>
        <div className="detail-block">
          <h3>代表者</h3>
          <Fg label="姓" name="last_name" />
          <Fg label="名" name="first_name" />
          <Fg label="姓ふりがな" name="last_name_kana" />
          <Fg label="名ふりがな" name="first_name_kana" />
          <FormSelectField
            label="グループ形態"
            name="group_type"
            options={GROUP_TYPE_OPTIONS}
          />
          <Fg label="グループ名" name="group_name" />
          <Fg label="メールアドレス" name="email" type="email" />
          <Fg label="電話番号" name="phone" />
          <FormSelectField
            label="電話でご連絡可能な時間帯"
            name="phone_available"
            options={PHONE_AVAILABLE_OPTIONS}
          />
          <FormSelectField
            id="ma-channel"
            label="予約経路"
            name="channel"
            options={CHANNEL_OPTIONS}
            defaultValue="代入力"
            allowEmpty={false}
          />
          <FormSelectField
            id="ma-status"
            label="ステータス"
            name="status"
            options={MANUAL_RESERVATION_STATUS_OPTIONS}
            defaultValue="確定"
            allowEmpty={false}
          />
        </div>

        <div className="detail-block">
          <h3>住所</h3>
          <Fg label="郵便番号" name="postal_code" />
          <Fg label="都道府県" name="prefecture" />
          <Fg label="市区町村" name="city" />
          <Fg label="建物名・番地" name="address_line" />
        </div>

        <div className="detail-block">
          <h3>宿泊</h3>
          <DateField
            id="ma-checkin"
            label="チェックイン"
            name="check_in"
            required
          />
          <DateField
            id="ma-checkout"
            label="チェックアウト"
            name="check_out"
            required
          />
          <RoomGuestFields
            variant="reservation"
            defaults={{
              guestTotal: 0,
              maleCount: 0,
              femaleCount: 0,
              boyStudent: 0,
              girlStudent: 0,
              age3plus: 0,
              under3: 0,
            }}
          />
          <FormSelectField
            label="到着予定時間"
            name="arrival_time"
            options={ARRIVAL_TIME_OPTIONS}
          />
        </div>

        <div className="detail-block">
          <h3>食事・交通</h3>
          <FormSelectField
            label="お食事について"
            name="meal"
            options={MEAL_OPTIONS}
          />
          <FormSelectField
            label="バーベキュー道具のレンタル"
            name="bbq"
            options={BBQ_OPTIONS}
          />
          <FormSelectField
            label="流しそうめんレンタル"
            name="somen"
            options={SOMEN_OPTIONS}
          />
          <FormSelectField
            label="交通手段"
            name="transport"
            options={TRANSPORT_OPTIONS}
          />
          <Fg label="車両台数" name="vehicle_count" />
        </div>

        <div className="detail-block">
          <h3>アンケート</h3>
          <div className="form-group">
            <label htmlFor="ma-inquiry">お問い合わせ内容</label>
            <Textarea id="ma-inquiry" name="inquiry" rows={3} />
          </div>
          <FormCheckboxGroup
            label="旅行の目的（複数選択可）"
            name="travel_purpose"
            options={TRAVEL_PURPOSE_OPTIONS}
          />
          <Fg label="旅行の目的（その他）" name="travel_purpose_other" />
          <FormSelectField
            label="当施設を知ったきっかけ"
            name="referral"
            options={REFERRAL_OPTIONS}
          />
          <Fg label="きっかけ（その他）" name="referral_other" />
          <Fg label="前回ご宿泊時期" name="last_stay" />
        </div>

        <div className="detail-block">
          <h3>運用</h3>
          <div className="form-group">
            <label htmlFor="ma-memo">運用メモ</label>
            <Textarea
              id="ma-memo"
              name="internal_memo"
              rows={3}
              placeholder="特別な事情・配慮が必要なケース"
            />
          </div>
          <div className="form-group">
            <label htmlFor="ma-guest-memo">宿泊者メモ</label>
            <Textarea
              id="ma-guest-memo"
              name="guest_memo"
              rows={3}
              placeholder="当日知りえた情報"
            />
          </div>
          {state.ok === false ? (
            <p className="detail-hint" style={{ color: "#b91c1c" }}>
              {state.message}
            </p>
          ) : null}
          <Button type="submit" disabled={isPending}>
            {isPending ? "追加中…" : "予約を追加"}
          </Button>
        </div>
      </form>
    </>
  );
}
