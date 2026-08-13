"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { DateField } from "@/components/form/DateField";
import { FormCheckboxGroup } from "@/components/form/FormCheckboxGroup";
import { FormSelectField } from "@/components/form/FormSelectField";
import {
  GuestBreakdownFields,
  guestBreakdownEqual,
  guestBreakdownFromUnknown,
  type GuestBreakdownValues,
} from "@/components/reservations/GuestBreakdownFields";
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
  SOMEN_OPTIONS,
  TRANSPORT_OPTIONS,
  TRAVEL_PURPOSE_OPTIONS,
} from "@/lib/config/field-options";
import { markLocalDataMutation } from "@/lib/utils/local-mutation";
import { submitFormAction } from "@/lib/utils/submit-form-action";
import { useSaveResultToast } from "@/lib/hooks/use-save-result-toast";

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
  somen: string | null;
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

type FormSeed = {
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
  arrivalTime: string | null;
  transport: string | null;
  vehicleCount: string | null;
  meal: string | null;
  bbq: string | null;
  somen: string | null;
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

function formSeedFromProps(props: Props): FormSeed {
  return {
    updatedAt: props.updatedAt,
    status: props.status,
    channel: props.channel,
    groupType: props.groupType,
    groupName: props.groupName,
    lastName: props.lastName,
    firstName: props.firstName,
    lastNameKana: props.lastNameKana,
    firstNameKana: props.firstNameKana,
    email: props.email,
    phone: props.phone,
    phoneAvailable: props.phoneAvailable,
    postalCode: props.postalCode,
    prefecture: props.prefecture,
    city: props.city,
    addressLine: props.addressLine,
    checkIn: props.checkIn,
    checkOut: props.checkOut,
    arrivalTime: props.arrivalTime,
    transport: props.transport,
    vehicleCount: props.vehicleCount,
    meal: props.meal,
    bbq: props.bbq,
    somen: props.somen,
    inquiry: props.inquiry,
    travelPurpose: props.travelPurpose,
    travelPurposeOther: props.travelPurposeOther,
    referral: props.referral,
    referralOther: props.referralOther,
    lastStay: props.lastStay,
    internalMemo: props.internalMemo,
    guestMemo: props.guestMemo,
    paymentStatus: props.paymentStatus,
  };
}

export function ReservationUpdateForm(props: Props) {
  const [state, rawFormAction, isPending] = useActionState(
    updateReservationAction,
    initialState
  );
  useSaveResultToast(isPending, state);
  const [formSeed, setFormSeed] = useState<FormSeed>(() =>
    formSeedFromProps(props)
  );
  const [guests, setGuests] = useState<GuestBreakdownValues>(() =>
    guestBreakdownFromUnknown(props)
  );
  const [formEpoch, setFormEpoch] = useState(0);
  const [appliedSaveAt, setAppliedSaveAt] = useState<string | null>(null);
  const skipFirstPropsSync = useRef(true);
  const localSavePinRef = useRef<GuestBreakdownValues | null>(null);

  const savedGuests =
    state.ok === true && "guests" in state && state.guests
      ? state.guests
      : null;
  const savedAt =
    state.ok === true && "updatedAt" in state && state.updatedAt
      ? state.updatedAt
      : null;

  // 保存成功: 人数はアクション結果を正とし、フォーム全体はリマウントしない
  if (savedGuests && savedAt && savedAt !== appliedSaveAt) {
    const nextGuests = guestBreakdownFromUnknown(savedGuests);
    setAppliedSaveAt(savedAt);
    localSavePinRef.current = nextGuests;
    setGuests(nextGuests);
    setFormSeed((prev) => ({ ...prev, updatedAt: savedAt }));
  }

  // props 同期: 保存ピン中は人数が一致するまで絶対に書き戻さない。
  // updatedAt が新しいだけでは受け入れない（GCal 等で timestamp だけ進むため）。
  useEffect(() => {
    if (skipFirstPropsSync.current) {
      skipFirstPropsSync.current = false;
      return;
    }
    const propsGuests = guestBreakdownFromUnknown(props);
    const pin = localSavePinRef.current;

    if (pin) {
      if (guestBreakdownEqual(propsGuests, pin)) {
        localSavePinRef.current = null;
        setFormSeed((prev) => ({
          ...prev,
          updatedAt: props.updatedAt,
        }));
      }
      // ピン中は人数も他フィールドもリマウントしない
      return;
    }

    setFormSeed(formSeedFromProps(props));
    setGuests(propsGuests);
    setFormEpoch((n) => n + 1);
  }, [
    props.updatedAt,
    props.status,
    props.channel,
    props.guestTotal,
    props.adultMale,
    props.adultFemale,
    props.boyStudent,
    props.girlStudent,
    props.age3plus,
    props.under3,
    props.checkIn,
    props.checkOut,
    props.internalMemo,
    props.guestMemo,
    props.paymentStatus,
    props.lastName,
    props.firstName,
    props.email,
    props.phone,
  ]);

  // 保存直後の router.refresh は古い RSC キャッシュを呼び込みやすいので行わない。
  // 詳細の読み取り専用ブロックは次回遷移 / Realtime で追いつく。

  const formAction = (formData: FormData) => {
    startTransition(() => {
      rawFormAction(formData);
    });
  };

  const onSubmit = submitFormAction(formAction, {
    beforeSubmit: (_form, formData) => {
      markLocalDataMutation(30_000);
      // controlled state を正として送信（PC/スマホ共通）
      formData.set("guest_total", guests.guestTotal);
      formData.set("adult_male", guests.adultMale);
      formData.set("adult_female", guests.adultFemale);
      formData.set("boy_student", guests.boyStudent);
      formData.set("girl_student", guests.girlStudent);
      formData.set("age_3plus", guests.age3plus);
      formData.set("under_3", guests.under3);
      localSavePinRef.current = { ...guests };
    },
  });

  return (
    <form key={`${props.reservationId}:${formEpoch}`} onSubmit={onSubmit}>
      <input type="hidden" name="reservation_id" value={props.reservationId} />
      <input
        type="hidden"
        name="expected_updated_at"
        value={formSeed.updatedAt ?? ""}
      />

      <p className="form-section-label">基本</p>
      <FormSelectField
        id="f-status"
        label="ステータス"
        name="status"
        options={RESERVATION_STATUS_OPTIONS}
        defaultValue={formSeed.status}
        allowEmpty={false}
      />
      <FormSelectField
        id="f-channel"
        label="予約経路"
        name="channel"
        options={CHANNEL_OPTIONS}
        defaultValue={formSeed.channel}
      />
      <Fg label="姓" name="last_name" defaultValue={formSeed.lastName} />
      <Fg label="名" name="first_name" defaultValue={formSeed.firstName} />
      <Fg
        label="姓ふりがな"
        name="last_name_kana"
        defaultValue={formSeed.lastNameKana}
      />
      <Fg
        label="名ふりがな"
        name="first_name_kana"
        defaultValue={formSeed.firstNameKana}
      />
      <FormSelectField
        label="グループ形態"
        name="group_type"
        options={GROUP_TYPE_OPTIONS}
        defaultValue={formSeed.groupType}
      />
      <Fg label="グループ名" name="group_name" defaultValue={formSeed.groupName} />
      <Fg
        label="メール"
        name="email"
        type="email"
        defaultValue={formSeed.email}
      />
      <Fg label="電話" name="phone" defaultValue={formSeed.phone} />
      <FormSelectField
        label="電話可能時間"
        name="phone_available"
        options={PHONE_AVAILABLE_OPTIONS}
        defaultValue={formSeed.phoneAvailable}
      />

      <p className="form-section-label">住所</p>
      <Fg label="郵便番号" name="postal_code" defaultValue={formSeed.postalCode} />
      <Fg label="都道府県" name="prefecture" defaultValue={formSeed.prefecture} />
      <Fg label="市区町村" name="city" defaultValue={formSeed.city} />
      <Fg
        label="建物名・番地"
        name="address_line"
        defaultValue={formSeed.addressLine}
      />

      <p className="form-section-label">宿泊日・人数</p>
      <DateField
        id="f-checkin"
        label="チェックイン"
        name="check_in"
        defaultValue={formSeed.checkIn}
      />
      <DateField
        id="f-checkout"
        label="チェックアウト"
        name="check_out"
        defaultValue={formSeed.checkOut}
      />
      <GuestBreakdownFields values={guests} onChange={setGuests} />

      <p className="form-section-label">交通・到着</p>
      <FormSelectField
        label="到着予定時間"
        name="arrival_time"
        options={ARRIVAL_TIME_OPTIONS}
        defaultValue={formSeed.arrivalTime}
      />
      <FormSelectField
        label="交通手段"
        name="transport"
        options={TRANSPORT_OPTIONS}
        defaultValue={formSeed.transport}
      />
      <Fg
        label="車両台数"
        name="vehicle_count"
        defaultValue={formSeed.vehicleCount}
      />

      <p className="form-section-label">食事・支払</p>
      <FormSelectField
        label="食事"
        name="meal"
        options={MEAL_OPTIONS}
        defaultValue={formSeed.meal}
      />
      <FormSelectField
        label="BBQ"
        name="bbq"
        options={BBQ_OPTIONS}
        defaultValue={formSeed.bbq}
      />
      <FormSelectField
        label="流しそうめんレンタル"
        name="somen"
        options={SOMEN_OPTIONS}
        defaultValue={formSeed.somen}
      />
      <FormSelectField
        id="f-pay"
        label="支払"
        name="payment_status"
        options={PAYMENT_STATUS_OPTIONS}
        defaultValue={formSeed.paymentStatus ?? "未払い"}
        allowEmpty={false}
      />

      <p className="form-section-label">アンケート</p>
      <div className="form-group">
        <label htmlFor="f-inquiry">お問い合わせ内容</label>
        <Textarea
          id="f-inquiry"
          name="inquiry"
          rows={3}
          defaultValue={formSeed.inquiry ?? ""}
        />
      </div>
      <FormCheckboxGroup
        label="旅行の目的（複数選択可）"
        name="travel_purpose"
        options={TRAVEL_PURPOSE_OPTIONS}
        defaultValue={formSeed.travelPurpose}
      />
      <Fg
        label="旅行の目的（その他）"
        name="travel_purpose_other"
        defaultValue={formSeed.travelPurposeOther}
      />
      <FormSelectField
        label="きっかけ"
        name="referral"
        options={REFERRAL_OPTIONS}
        defaultValue={formSeed.referral}
      />
      <Fg
        label="きっかけ（その他）"
        name="referral_other"
        defaultValue={formSeed.referralOther}
      />
      <Fg label="前回ご宿泊時期" name="last_stay" defaultValue={formSeed.lastStay} />

      <p className="form-section-label">メモ</p>
      <div className="form-group">
        <label htmlFor="f-memo">運用メモ</label>
        <Textarea
          id="f-memo"
          name="internal_memo"
          rows={3}
          defaultValue={formSeed.internalMemo ?? ""}
        />
      </div>
      <div className="form-group">
        <label htmlFor="f-guest-memo">お客様メモ</label>
        <Textarea
          id="f-guest-memo"
          name="guest_memo"
          rows={3}
          defaultValue={formSeed.guestMemo ?? ""}
          placeholder="当日知りえた情報"
        />
      </div>

      {state.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : null}

      <div className="form-actions-sticky">
        {state.ok === true && !isPending && savedGuests ? (
          <p className="detail-hint save-result-ok">保存しました</p>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : "保存"}
        </Button>
      </div>
    </form>
  );
}
