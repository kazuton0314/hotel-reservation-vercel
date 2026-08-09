"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  encodeMergeField,
  normalizeMergeText,
} from "@/lib/services/mail-merge";

export type MailMergeEditorHandle = {
  insertKey: (key: string) => string;
  focus: () => void;
};

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
};

/**
 * 差し込みトークン対応のテキスト編集。
 * contenteditable は環境によって入力不能になるため textarea を使う。
 * 差し込みチップは ⟦項目名⟧ としてカーソル位置へ挿入される。
 */
export const MailMergeEditor = forwardRef<MailMergeEditorHandle, Props>(
  function MailMergeEditor(
    {
      id,
      value,
      onChange,
      onFocus,
      multiline = true,
      className = "",
      placeholder,
      ariaLabel,
    },
    ref
  ) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const normalizedValue = normalizeMergeText(value);

    const emit = (next: string) => {
      const normalized = normalizeMergeText(next);
      onChange(normalized);
      return normalized;
    };

    const insertAtSelection = (insertion: string): string => {
      const ta = taRef.current;
      const cur = ta?.value ?? normalizedValue;
      const start = ta?.selectionStart ?? cur.length;
      const end = ta?.selectionEnd ?? start;
      const next = cur.slice(0, start) + insertion + cur.slice(end);
      const normalized = emit(next);
      const caret = start + insertion.length;
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
      return normalized;
    };

    useImperativeHandle(ref, () => ({
      insertKey(key: string) {
        return insertAtSelection(encodeMergeField(key));
      },
      focus() {
        taRef.current?.focus();
      },
    }));

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      emit(e.target.value);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!multiline && e.key === "Enter") {
        e.preventDefault();
      }
    };

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (multiline) return;
      e.preventDefault();
      const text = e.clipboardData
        .getData("text/plain")
        .replace(/\r\n?|\n/g, " ");
      insertAtSelection(text);
    };

    const handleDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
      if (e.dataTransfer.types.includes("application/x-mail-merge")) {
        e.preventDefault();
      }
    };

    const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
      const key = e.dataTransfer.getData("application/x-mail-merge");
      if (!key) return;
      e.preventDefault();
      taRef.current?.focus();
      insertAtSelection(encodeMergeField(key));
    };

    return (
      <textarea
        id={id}
        ref={taRef}
        className={`mail-merge-editor ${multiline ? "" : "mail-merge-editor-single"} ${className}`.trim()}
        value={normalizedValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={onFocus}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={multiline ? 14 : 1}
        spellCheck
      />
    );
  }
);

export { normalizeMergeText };
