"use client";

import {
  optionsWithCurrentValues,
  parseMultiSelectValues,
} from "@/lib/config/field-options";

type Props = {
  label: string;
  name: string;
  options: readonly string[];
  defaultValue?: string | null;
  /** 省略時はラベル末尾に（複数選択可）を付けない。明示したい場合は label に含める */
  hint?: string | null;
};

export function FormCheckboxGroup({
  label,
  name,
  options,
  defaultValue,
  hint = null,
}: Props) {
  const selected = new Set(parseMultiSelectValues(defaultValue));
  const merged = optionsWithCurrentValues(options, defaultValue);

  return (
    <div className="form-group form-group-checkbox">
      <span className="form-group-heading">{label}</span>
      {hint ? <p className="detail-hint form-checkbox-hint">{hint}</p> : null}
      <div className="form-checkbox-group" role="group" aria-label={label}>
        {merged.map((opt) => (
          <label key={opt} className="form-checkbox-item">
            <input
              type="checkbox"
              name={name}
              value={opt}
              defaultChecked={selected.has(opt)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
