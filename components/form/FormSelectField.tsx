"use client";

import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/input";
import { optionsWithCurrent } from "@/lib/config/field-options";

type Props = {
  label: string;
  name: string;
  options: readonly string[];
  defaultValue?: string | null;
  id?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

/**
 * React 19 + useActionState では、form action 成功後に <select> だけ
 * 初期値へ戻る既知不具合がある（text input は残る）。
 * 送信用は hidden、表示用 select は controlled + 送信後リマウントで回避する。
 */
export function FormSelectField({
  label,
  name,
  options,
  defaultValue,
  id,
  allowEmpty = true,
  emptyLabel = "（未選択）",
}: Props) {
  const fieldId = id ?? name;
  const incoming = String(defaultValue ?? "").trim();
  const [value, setValue] = useState(incoming);
  const [selectKey, setSelectKey] = useState(0);
  const prevIncoming = useRef(incoming);

  if (incoming !== prevIncoming.current) {
    prevIncoming.current = incoming;
    setValue(incoming);
    setSelectKey((k) => k + 1);
  }

  const merged = optionsWithCurrent(options, value);

  useEffect(() => {
    const el = document.getElementById(fieldId);
    const form = el?.closest("form");
    if (!form) return;

    const recoverAfterActionReset = () => {
      // action 完了後の automatic reset より後に載せて表示を正す
      window.setTimeout(() => {
        setSelectKey((k) => k + 1);
      }, 0);
    };

    form.addEventListener("submit", recoverAfterActionReset);
    return () => form.removeEventListener("submit", recoverAfterActionReset);
  }, [fieldId]);

  return (
    <div className="form-group">
      <label htmlFor={fieldId}>{label}</label>
      <input type="hidden" name={name} value={value} />
      <Select
        key={`${fieldId}:${selectKey}`}
        id={fieldId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        {allowEmpty ? (
          <option value="">{emptyLabel}</option>
        ) : null}
        {merged.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </div>
  );
}
