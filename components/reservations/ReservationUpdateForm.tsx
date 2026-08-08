"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/form/DateField";
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
  GUEST_COUNT_OPTIONS,
  MEAL_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PHONE_AVAILABLE_OPTIONS,
  REFERRAL_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVEL_PURPOSE_OPTIONS,
} from "@/lib/config/field-options";
import { markLocalDataMutation } from "@/lib/utils/local-mutation";

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
  guestMemo: string | null;
  paymentStatus: string | null;
};

type GuestSeed = {
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  boyStudent: string | null;
  girlStudent: string | null;
  age3plus: string | null;
  under3: string | null;
};

const initialState = { ok: true } as const;

/** 内訳プルダウン用: 0 / 空は未選択（表示ラベル 0）へ寄せる */
function guestCountSelectValue(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v || v === "0") return "";
  return v;
}

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

function guestSeedFromProps(props: Props): GuestSeed {
  return {
    guestTotal: props.guestTotal,
    adultMale: props.adultMale,
    adultFemale: props.adultFemale,
    boyStudent: props.boyStudent,
    girlStudent: props.girlStudent,
    age3plus: props.age3plus,
    under3: props.under3,
  };
}

export function ReservationUpdateForm(props: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateReservationAction,
    initialState
  );
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(props.updatedAt);
  const [guestSeed, setGuestSeed] = useState<GuestSeed>(() =>
    guestSeedFromProps(props)
  );
  const [formEpoch, setFormEpoch] = useState(0);
  const skipFirstPropsSync = useRef(true);
  const lastSavedAtRef = useRef<string | null>(null);

  // サーバー props が追いついたら（他端末更新・再読込）フォームの初期値を同期。
  // ただし保存直後に古いキャッシュ props が来た場合は書き戻さない。
  useEffect(() => {
    if (skipFirstPropsSync.current) {
      skipFirstPropsSync.current = false;
      return;
    }
    const propsUpdatedAt = props.updatedAt ?? "";
    const savedAt = lastSavedAtRef.current;
    if (savedAt && propsUpdatedAt && propsUpdatedAt < savedAt) {
      return;
    }
    if (savedAt && propsUpdatedAt && propsUpdatedAt >= savedAt) {
      lastSavedAtRef.current = null;
    }
    setExpectedUpdatedAt(props.updatedAt);
    setGuestSeed(guestSeedFromProps(props));
    setFormEpoch((n) => n + 1);
  }, [
    props.updatedAt,
    props.guestTotal,
    props.adultMale,
    props.adultFemale,
    props.boyStudent,
    props.girlStudent,
    props.age3plus,
    props.under3,
  ]);

  // 保存成功時はアクションが返した人数を正として残し、古いキャッシュの書き戻しを防ぐ
  useEffect(() => {
    if (!state || state.ok !== true) return;
    if (!("guests" in state) || !state.guests) return;
    markLocalDataMutation();
    lastSavedAtRef.current = state.updatedAt ?? null;
    setExpectedUpdatedAt(state.updatedAt ?? expectedUpdatedAt);
    setGuestSeed(state.guests);
    setFormEpoch((n) => n + 1);
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 保存成功の state 変化時のみ
  }, [state]);

  const formKey = useMemo(
    () =>
      `${props.reservationId}:${expectedUpdatedAt ?? ""}:${formEpoch}:${guestSeed.guestTotal ?? ""}:${guestSeed.adultMale ?? ""}`,
    [
      props.reservationId,
      expectedUpdatedAt,
      formEpoch,
      guestSeed.guestTotal,
      guestSeed.adultMale,
    ]
  );

  return (
    <form
      key={formKey}
      action={formAction}
      onSubmit={() => {
        markLocalDataMutation();
      }}
    >
      <input type="hidden" name="reservation_id" value={props.reservationId} />
      <input
        type="hidden"
        name="expected_updated_at"
        value={expectedUpdatedAt ?? ""}
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
      <DateField
        id="f-checkin"
        label="チェックイン"
        name="check_in"
        defaultValue={props.checkIn}
      />
      <DateField
        id="f-checkout"
        label="チェックアウト"
        name="check_out"
        defaultValue={props.checkOut}
      />
      <Fg
        label="宿泊人数"
        name="guest_total"
        defaultValue={guestSeed.guestTotal}
      />
      <FormSelectField
        label="中学生以上男性"
        name="adult_male"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(guestSeed.adultMale)}
        emptyLabel="0"
      />
      <FormSelectField
        label="中学生以上女性"
        name="adult_female"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(guestSeed.adultFemale)}
        emptyLabel="0"
      />
      <FormSelectField
        label="小学生男"
        name="boy_student"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(guestSeed.boyStudent)}
        emptyLabel="0"
      />
      <FormSelectField
        label="小学生女"
        name="girl_student"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(guestSeed.girlStudent)}
        emptyLabel="0"
      />
      <FormSelectField
        label="3歳以上幼児"
        name="age_3plus"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(guestSeed.age3plus)}
        emptyLabel="0"
      />
      <FormSelectField
        label="3歳未満"
        name="under_3"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(guestSeed.under3)}
        emptyLabel="0"
      />

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

      <p className="form-section-label">食事・支払</p>
      <FormSelectField
        label="食事"
        name="meal"
        options={MEAL_OPTIONS}
        defaultValue={props.meal}
      />
      <FormSelectField
        label="BBQ"
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
        label="旅行の目的（複数選択可）"
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
        <label htmlFor="f-memo">運用メモ</label>
        <Textarea
          id="f-memo"
          name="internal_memo"
          rows={3}
          defaultValue={props.internalMemo ?? ""}
        />
      </div>
      <div className="form-group">
        <label htmlFor="f-guest-memo">お客様メモ</label>
        <Textarea
          id="f-guest-memo"
          name="guest_memo"
          rows={3}
          defaultValue={props.guestMemo ?? ""}
          placeholder="当日知りえた情報"
        />
      </div>

      {state.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : state.ok === true && !isPending && "guests" in state && state.guests ? (
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
