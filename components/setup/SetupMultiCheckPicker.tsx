"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SetupCheckOption = {
  value: string;
  label: string;
};

type Props = {
  options: SetupCheckOption[];
  value: string[];
  onChange: (values: string[]) => void;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
};

/** スプシセル用の複数選択ドロップダウン */
export function SetupMultiCheckPicker({
  options,
  value,
  onChange,
  emptyLabel = "（未選択）",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = new Set(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const label =
    value.length === 0
      ? emptyLabel
      : value
          .map((v) => options.find((o) => o.value === v)?.label ?? v)
          .join("、");

  const toggle = (optionValue: string) => {
    const next = new Set(selected);
    if (next.has(optionValue)) next.delete(optionValue);
    else next.add(optionValue);
    onChange([...next]);
  };

  return (
    <div
      className={`setup-room-picker${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="setup-room-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        title={label}
      >
        <span className="setup-room-trigger-text">{label}</span>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div id={listId} className="setup-room-menu" role="listbox">
          {options.map((opt) => (
            <label key={opt.value} className="setup-room-option">
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
          {!options.length ? (
            <p className="setup-room-empty">選択肢がありません</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
