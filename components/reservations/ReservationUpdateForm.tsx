"use client";

import {
  useActionState,
  useEffect,
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
import { submitFormAction } from "@/lib/utils/submit-form-action";

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

/** 編集フォーム全体の初期値（リマウント時のみ使う） */
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
  guests: GuestSeed;
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
    guests: guestSeedFromProps(props),
    arrivalTime: props.arrivalTime,
    transport: props.transport,
    vehicleCount: props.vehicleCount,
    meal: props.meal,
    bbq: props.bbq,
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

function guestSeedsEqual(a: GuestSeed, b: GuestSeed): boolean {
  return (
    String(a.guestTotal ?? "") === String(b.guestTotal ?? "") &&
    String(a.adultMale ?? "") === String(b.adultMale ?? "") &&
    String(a.adultFemale ?? "") === String(b.adultFemale ?? "") &&
    String(a.boyStudent ?? "") === String(b.boyStudent ?? "") &&
    String(a.girlStudent ?? "") === String(b.girlStudent ?? "") &&
    String(a.age3plus ?? "") === String(b.age3plus ?? "") &&
    String(a.under3 ?? "") === String(b.under3 ?? "")
  );
}

export function ReservationUpdateForm(props: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updateReservationAction,
    initialState
  );
  const [formSeed, setFormSeed] = useState<FormSeed>(() =>
    formSeedFromProps(props)
  );
  const [formEpoch, setFormEpoch] = useState(0);
  const [appliedSaveAt, setAppliedSaveAt] = useState<string | null>(null);
  const skipFirstPropsSync = useRef(true);
  const lastSavedAtRef = useRef<string | null>(null);
  const lastSavedGuestsRef = useRef<GuestSeed | null>(null);

  const savedGuests =
    state.ok === true && "guests" in state && state.guests
      ? state.guests
      : null;
  const savedAt =
    state.ok === true && "updatedAt" in state && state.updatedAt
      ? state.updatedAt
      : null;

  // 保存成功: optimistic lock 用 timestamp とピンだけ更新。
  // フォームはリマウントしない（スマホで選択中の DOM 値を維持する）。
  if (savedGuests && savedAt && savedAt !== appliedSaveAt) {
    setAppliedSaveAt(savedAt);
    lastSavedAtRef.current = savedAt;
    lastSavedGuestsRef.current = savedGuests;
    setFormSeed((prev) => ({
      ...prev,
      updatedAt: savedAt,
      guests: savedGuests,
    }));
  }

  // 他端末更新・十分な新しさの props だけフォームを載せ替える。
  // 保存直後の古いキャッシュでは人数内訳を書き戻さない。
  useEffect(() => {
    if (skipFirstPropsSync.current) {
      skipFirstPropsSync.current = false;
      return;
    }
    const propsUpdatedAt = props.updatedAt ?? "";
    const savedAtPin = lastSavedAtRef.current;
    const savedGuestsPin = lastSavedGuestsRef.current;
    const propsGuests = guestSeedFromProps(props);

    if (savedGuestsPin) {
      if (guestSeedsEqual(propsGuests, savedGuestsPin)) {
        lastSavedAtRef.current = null;
        lastSavedGuestsRef.current = null;
      } else if (savedAtPin && propsUpdatedAt && propsUpdatedAt > savedAtPin) {
        lastSavedAtRef.current = null;
        lastSavedGuestsRef.current = null;
      } else {
        return;
      }
    } else if (savedAtPin && propsUpdatedAt && propsUpdatedAt < savedAtPin) {
      return;
    }

    setFormSeed(formSeedFromProps(props));
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
  ]);

  useEffect(() => {
    if (!savedGuests || !savedAt) return;
    markLocalDataMutation();
    router.refresh();
  }, [savedGuests, savedAt, router]);

  const onSubmit = submitFormAction(formAction, {
    beforeSubmit: (form, formData) => {
      markLocalDataMutation();
      // 人数内訳は DOM の select 現値を明示採用（スマホの FormData ずれ防止）
      for (const name of [
        "adult_male",
        "adult_female",
        "boy_student",
        "girl_student",
        "age_3plus",
        "under_3",
      ] as const) {
        const el = form.elements.namedItem(name);
        if (el instanceof HTMLSelectElement) {
          formData.set(name, el.value);
        }
      }
      const total = form.elements.namedItem("guest_total");
      if (total instanceof HTMLInputElement) {
        formData.set("guest_total", total.value);
      }
    },
  });

  const g = formSeed.guests;

  return (
    <form
      key={`${props.reservationId}:${formEpoch}`}
      onSubmit={onSubmit}
    >
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
      <Fg label="宿泊人数" name="guest_total" defaultValue={g.guestTotal} />
      <FormSelectField
        label="中学生以上男性"
        name="adult_male"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(g.adultMale)}
        emptyLabel="0"
      />
      <FormSelectField
        label="中学生以上女性"
        name="adult_female"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(g.adultFemale)}
        emptyLabel="0"
      />
      <FormSelectField
        label="小学生男"
        name="boy_student"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(g.boyStudent)}
        emptyLabel="0"
      />
      <FormSelectField
        label="小学生女"
        name="girl_student"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(g.girlStudent)}
        emptyLabel="0"
      />
      <FormSelectField
        label="3歳以上幼児"
        name="age_3plus"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(g.age3plus)}
        emptyLabel="0"
      />
      <FormSelectField
        label="3歳未満"
        name="under_3"
        options={GUEST_COUNT_OPTIONS}
        defaultValue={guestCountSelectValue(g.under3)}
        emptyLabel="0"
      />

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
      ) : state.ok === true && !isPending && savedGuests ? (
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
