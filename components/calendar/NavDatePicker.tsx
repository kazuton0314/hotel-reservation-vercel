"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  id: string;
  label: string;
  type: "date" | "month";
  value: string;
  onChange: (value: string) => void;
};

export function NavDatePicker({ id, label, type, value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  };

  return (
    <div className="nav-date-picker">
      <button
        type="button"
        className="nav-date-label"
        onClick={openPicker}
        aria-controls={id}
      >
        {label}
      </button>
      <Input
        ref={inputRef}
        type={type}
        id={id}
        className="nav-date-input"
        value={value}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
