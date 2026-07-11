"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FocusEvent,
} from "react";
import {
  insertMergeChip,
  mergeTextToHtml,
  normalizeMergeText,
  serializeMergeEditor,
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
    const rootRef = useRef<HTMLDivElement>(null);
    const focusedRef = useRef(false);
    const [empty, setEmpty] = useState(!normalizeMergeText(value).trim());

    const syncFromValue = useCallback((next: string) => {
      const el = rootRef.current;
      if (!el || focusedRef.current) return;
      const html = mergeTextToHtml(next);
      if (el.innerHTML !== html) {
        el.innerHTML = html;
      }
      setEmpty(!normalizeMergeText(next).trim());
    }, []);

    useEffect(() => {
      syncFromValue(value);
    }, [value, syncFromValue]);

    const emitChange = useCallback(() => {
      const el = rootRef.current;
      if (!el) return "";
      const serialized = serializeMergeEditor(el);
      setEmpty(!serialized.trim());
      onChange(serialized);
      return serialized;
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      insertKey(key: string) {
        const el = rootRef.current;
        if (!el) return "";
        el.focus();
        insertMergeChip(el, key);
        return emitChange();
      },
      focus() {
        rootRef.current?.focus();
      },
    }));

    const handleInput = () => {
      emitChange();
    };

    const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
      focusedRef.current = true;
      onFocus?.();
    };

    const handleBlur = () => {
      focusedRef.current = false;
      emitChange();
    };

    const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
      emitChange();
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
      const key = e.dataTransfer.getData("application/x-mail-merge");
      if (!key) return;
      e.preventDefault();
      const el = rootRef.current;
      if (!el) return;
      el.focus();
      insertMergeChip(el, key);
      emitChange();
    };

    return (
      <div
        className={`mail-merge-editor-wrap${empty ? " is-empty" : ""}${multiline ? "" : " mail-merge-editor-single"}`}
      >
        {placeholder && empty ? (
          <span className="mail-merge-placeholder" aria-hidden>
            {placeholder}
          </span>
        ) : null}
        <div
          id={id}
          ref={rootRef}
          className={`mail-merge-editor ${className}`.trim()}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={ariaLabel}
          aria-multiline={multiline}
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-mail-merge")) {
              e.preventDefault();
            }
          }}
          onDrop={handleDrop}
        />
      </div>
    );
  }
);

export { normalizeMergeText };
