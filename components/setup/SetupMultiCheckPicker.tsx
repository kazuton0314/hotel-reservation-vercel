"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

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

const MENU_MAX_HEIGHT = 220;

/** スプシセル用の複数選択ドロップダウン（表の overflow 外へ portal） */
export function SetupMultiCheckPicker({
  options,
  value,
  onChange,
  emptyLabel = "（未選択）",
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = new Set(value);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;

    const updatePosition = () => {
      const trigger = rootRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < MENU_MAX_HEIGHT + 8 && rect.top > spaceBelow;
      const width = Math.max(rect.width, 160);
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - width - 8)
      );

      setMenuStyle({
        position: "fixed",
        left,
        width,
        maxHeight: MENU_MAX_HEIGHT,
        zIndex: 400,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 2, top: "auto" }
          : { top: rect.bottom + 2, bottom: "auto" }),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    // 表スクロールでずれるので閉じる（position 追従より確実）
    const onScroll = (e: Event) => {
      const target = e.target;
      if (
        target instanceof Node &&
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
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

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            className="setup-room-menu setup-room-menu-portal"
            role="listbox"
            style={menuStyle}
          >
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
          </div>,
          document.body
        )
      : null;

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
      {menu}
    </div>
  );
}
