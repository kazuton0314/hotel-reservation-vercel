"use client";

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
 * ネイティブ <select name> で送信する（スマホの選択値を FormData が直接拾う）。
 * React 19 の action 後 reset は親フォーム側で
 * preventDefault + formAction(FormData) により回避する。
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
  const current = String(defaultValue ?? "").trim();
  const merged = optionsWithCurrent(options, current);

  return (
    <div className="form-group">
      <label htmlFor={fieldId}>{label}</label>
      <Select id={fieldId} name={name} defaultValue={current}>
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
