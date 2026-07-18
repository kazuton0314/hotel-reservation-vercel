"use client";

import { useActionState } from "react";
import { FormCheckboxGroup } from "@/components/form/FormCheckboxGroup";
import { FormSelectField } from "@/components/form/FormSelectField";
import { updateReservationAction } from "@/lib/actions/reservations";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  ARRIVAL_TIME_OPTIONS,
  BBQ_OPTIONS,
  CHANNEL_OPTIONS,
  GROUP_TYPE_OPTIONS,
  MEAL_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PHONE_AVAILABLE_OPTIONS,
  REFERRAL_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVEL_PURPOSE_OPTIONS,
} from "@/lib/config/field-options";

type Props = {
  reservationId: string;
  updatedAt: string | null;
  status: string;
  channel: string | null;
  groupType: string | null;
  groupName: string | null;
  lastName: string | null;
  firstName: string | null;
  lastNameKana: string | null;
  firstNameKana: string | null;
  email: string | null;
  phone: string | null;
  phoneAvailable: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  boyStudent: string | null;
  girlStudent: string | null;
  age3plus: string | null;
  under3: string | null;
  arrivalTime: string | null;
  transport: string | null;
  vehicleCount: string | null;
  meal: string | null;
  bbq: string | null;
  inquiry: string | null;
  travelPurpose: string | null;
  travelPurposeOther: string | null;
  referral: string | null;
  referralOther: string | null;
  lastStay: string | null;
  internalMemo: string | null;
  paymentStatus: string | null;
};

const initialState = { ok: true } as const;

function Fg({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue: string | null;
  type?: string;
}) {
  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
      />
    </div>
  );
}

export function ReservationUpdateForm(props: Props) {
  const [state, formAction, isPending] = useActionState(
    updateReservationAction,
    initialState
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="reservation_id" value={props.reservationId} />
      <input
        type="hidden"
        name="expected_updated_at"
        value={props.updatedAt ?? ""}
      />

      <p className="form-section-label">基本</p>
      <FormSelectField
        id="f-status"
        label="ステータス"
        name="status"
        options={RESERVATION_STATUS_OPTIONS}
        defaultValue={props.status}
        allowEmpty={false}
      />
      <FormSelectField
        id="f-channel"
        label="予約経路"
        name="channel"
        options={CHANNEL_OPTIONS}
        defaultValue={props.channel}
      />
      <Fg label="姓" name="last_name" defaultValue={props.lastName} />
      <Fg label="名" name="first_name" defaultValue={props.firstName} />
      <Fg label="姓ふりがな" name="last_name_kana" defaultValue={props.lastNameKana} />
      <Fg label="名ふりがな" name="first_name_kana" defaultValue={props.firstNameKana} />
      <FormSelectField
        label="グループ形態"
        name="group_type"
        options={GROUP_TYPE_OPTIONS}
        defaultValue={props.groupType}
      />
      <Fg label="グループ名" name="group_name" defaultValue={props.groupName} />
      <Fg label="メール" name="email" type="email" defaultValue={props.email} />
      <Fg label="電話" name="phone" defaultValue={props.phone} />
      <FormSelectField
        label="電話可能時間"
        name="phone_available"
        options={PHONE_AVAILABLE_OPTIONS}
        defaultValue={props.phoneAvailable}
      />

      <p className="form-section-label">住所</p>
      <Fg label="郵便番号" name="postal_code" defaultValue={props.postalCode} />
      <Fg label="都道府県" name="prefecture" defaultValue={props.prefecture} />
      <Fg label="市区町村" name="city" defaultValue={props.city} />
      <Fg label="建物名・番地" name="address_line" defaultValue={props.addressLine} />

      <p className="form-section-label">宿泊日・人数</p>
      <div className="form-group">
        <label htmlFor="f-checkin">チェックイン</label>
        <Input
          id="f-checkin"
          type="date"
          name="check_in"
          defaultValue={props.checkIn ?? ""}
        />
      </div>
      <div className="form-group">
        <label htmlFor="f-checkout">チェックアウト</label>
        <Input
          id="f-checkout"
          type="date"
          name="check_out"
          defaultValue={props.checkOut ?? ""}
        />
      </div>
      <Fg label="宿泊人数" name="guest_total" defaultValue={props.guestTotal} />
      <Fg label="中学生以上男性" name="adult_male" defaultValue={props.adultMale} />
      <Fg label="中学生以上女性" name="adult_female" defaultValue={props.adultFemale} />
      <Fg label="小学生男" name="boy_student" defaultValue={props.boyStudent} />
      <Fg label="小学生女" name="girl_student" defaultValue={props.girlStudent} />
      <Fg label="3歳以上幼児" name="age_3plus" defaultValue={props.age3plus} />
      <Fg label="3歳未満" name="under_3" defaultValue={props.under3} />

      <p className="form-section-label">交通・到着</p>
      <FormSelectField
        label="到着予定時間"
        name="arrival_time"
        options={ARRIVAL_TIME_OPTIONS}
        defaultValue={props.arrivalTime}
      />
      <FormSelectField
        label="交通手段"
        name="transport"
        options={TRANSPORT_OPTIONS}
        defaultValue={props.transport}
      />
      <Fg label="車両台数" name="vehicle_count" defaultValue={props.vehicleCount} />

      <p className="form-section-label">食事・BBQ</p>
      <FormSelectField
        label="お食事について"
        name="meal"
        options={MEAL_OPTIONS}
        defaultValue={props.meal}
      />
      <FormSelectField
        label="BBQレンタル"
        name="bbq"
        options={BBQ_OPTIONS}
        defaultValue={props.bbq}
      />
      <FormSelectField
        id="f-pay"
        label="支払"
        name="payment_status"
        options={PAYMENT_STATUS_OPTIONS}
        defaultValue={props.paymentStatus ?? "未払い"}
        allowEmpty={false}
      />

      <p className="form-section-label">アンケート</p>
      <div className="form-group">
        <label htmlFor="f-inquiry">お問い合わせ内容</label>
        <Textarea
          id="f-inquiry"
          name="inquiry"
          rows={3}
          defaultValue={props.inquiry ?? ""}
        />
      </div>
      <FormCheckboxGroup
        label="旅行の目的"
        name="travel_purpose"
        options={TRAVEL_PURPOSE_OPTIONS}
        defaultValue={props.travelPurpose}
      />
      <Fg
        label="旅行の目的（その他）"
        name="travel_purpose_other"
        defaultValue={props.travelPurposeOther}
      />
      <FormSelectField
        label="きっかけ"
        name="referral"
        options={REFERRAL_OPTIONS}
        defaultValue={props.referral}
      />
      <Fg label="きっかけ（その他）" name="referral_other" defaultValue={props.referralOther} />
      <Fg label="前回ご宿泊時期" name="last_stay" defaultValue={props.lastStay} />

      <p className="form-section-label">メモ</p>
      <div className="form-group">
        <label htmlFor="f-memo">内部メモ</label>
        <Textarea
          id="f-memo"
          name="internal_memo"
          rows={3}
          defaultValue={props.internalMemo ?? ""}
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
