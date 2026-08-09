"use client";

import { Input, Select } from "@/components/ui/input";
import {
  GUEST_COUNT_OPTIONS,
  optionsWithCurrent,
} from "@/lib/config/field-options";

export type GuestBreakdownValues = {
  guestTotal: string;
  adultMale: string;
  adultFemale: string;
  boyStudent: string;
  girlStudent: string;
  age3plus: string;
  under3: string;
};

type Props = {
  values: GuestBreakdownValues;
  onChange: (next: GuestBreakdownValues) => void;
};

/** 表示用: 0/空は未選択（ラベル 0） */
export function toGuestSelectValue(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v || v === "0") return "";
  return v;
}

export function guestBreakdownFromUnknown(source: {
  guestTotal?: string | null;
  adultMale?: string | null;
  adultFemale?: string | null;
  boyStudent?: string | null;
  girlStudent?: string | null;
  age3plus?: string | null;
  under3?: string | null;
}): GuestBreakdownValues {
  return {
    guestTotal: String(source.guestTotal ?? ""),
    adultMale: toGuestSelectValue(source.adultMale),
    adultFemale: toGuestSelectValue(source.adultFemale),
    boyStudent: toGuestSelectValue(source.boyStudent),
    girlStudent: toGuestSelectValue(source.girlStudent),
    age3plus: toGuestSelectValue(source.age3plus),
    under3: toGuestSelectValue(source.under3),
  };
}

/** 保存ピン比較用: 0/空/null を同一視 */
export function guestBreakdownEqual(
  a: GuestBreakdownValues,
  b: GuestBreakdownValues
): boolean {
  const norm = (v: string) => {
    const t = String(v ?? "").trim();
    return !t || t === "0" ? "" : t;
  };
  return (
    String(a.guestTotal ?? "").trim() === String(b.guestTotal ?? "").trim() &&
    norm(a.adultMale) === norm(b.adultMale) &&
    norm(a.adultFemale) === norm(b.adultFemale) &&
    norm(a.boyStudent) === norm(b.boyStudent) &&
    norm(a.girlStudent) === norm(b.girlStudent) &&
    norm(a.age3plus) === norm(b.age3plus) &&
    norm(a.under3) === norm(b.under3)
  );
}

function GuestSelect({
  id,
  name,
  label,
  value,
  onValueChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onValueChange: (next: string) => void;
}) {
  const merged = optionsWithCurrent(GUEST_COUNT_OPTIONS, value);
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      {/* name 付き select の value を FormData / 明示 set の両方で使う */}
      <Select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="">0</option>
        {merged.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * 予約編集の人数内訳。controlled で保持し、保存後の props 書き戻しや
 * React 19 の select reset の影響を受けにくくする。
 */
export function GuestBreakdownFields({ values, onChange }: Props) {
  const patch = (key: keyof GuestBreakdownValues, next: string) => {
    onChange({ ...values, [key]: next });
  };

  return (
    <>
      <div className="form-group">
        <label htmlFor="guest_total">宿泊人数</label>
        <Input
          id="guest_total"
          name="guest_total"
          type="text"
          inputMode="numeric"
          value={values.guestTotal}
          onChange={(e) => patch("guestTotal", e.target.value)}
        />
      </div>
      <GuestSelect
        id="adult_male"
        name="adult_male"
        label="中学生以上男性"
        value={values.adultMale}
        onValueChange={(v) => patch("adultMale", v)}
      />
      <GuestSelect
        id="adult_female"
        name="adult_female"
        label="中学生以上女性"
        value={values.adultFemale}
        onValueChange={(v) => patch("adultFemale", v)}
      />
      <GuestSelect
        id="boy_student"
        name="boy_student"
        label="小学生男"
        value={values.boyStudent}
        onValueChange={(v) => patch("boyStudent", v)}
      />
      <GuestSelect
        id="girl_student"
        name="girl_student"
        label="小学生女"
        value={values.girlStudent}
        onValueChange={(v) => patch("girlStudent", v)}
      />
      <GuestSelect
        id="age_3plus"
        name="age_3plus"
        label="3歳以上幼児"
        value={values.age3plus}
        onValueChange={(v) => patch("age3plus", v)}
      />
      <GuestSelect
        id="under_3"
        name="under_3"
        label="3歳未満"
        value={values.under3}
        onValueChange={(v) => patch("under3", v)}
      />
    </>
  );
}
