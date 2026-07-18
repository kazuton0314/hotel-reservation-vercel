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
  hint?: string;
};

export function FormCheckboxGroup({
  label,
  name,
  options,
  defaultValue,
  hint = "複数選択可",
}: Props) {
  const selected = new Set(parseMultiSelectValues(defaultValue));
  const merged = optionsWithCurrentValues(options, defaultValue);

  return (
    <div className="form-group">
      <span className="form-group-heading">{label}</span>
      {hint ? <p className="detail-hint" style={{ marginBottom: 6 }}>{hint}</p> : null}
      <div className="form-checkbox-group">
        {merged.map((opt) => (
          <label key={opt} className="form-checkbox-item">
            <input
              type="checkbox"
              name={name}
              value={opt}
              defaultChecked={selected.has(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}
