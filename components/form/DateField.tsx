"use client";

import { Input } from "@/components/ui/input";

type Props = {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
};

/**
 * ネイティブ date は端末ロケール次第で固有の最小幅を持ち、
 * スマホで親幅を押し広げやすい。シェルでクリップして防ぐ。
 */
export function DateField({
  id,
  label,
  name,
  defaultValue,
  required,
}: Props) {
  return (
    <div className="form-group date-field">
      <label htmlFor={id}>{label}</label>
      <div className="date-field-shell">
        <Input
          id={id}
          type="date"
          name={name}
          className="date-field-input"
          defaultValue={defaultValue ?? ""}
          required={required}
        />
      </div>
    </div>
  );
}
