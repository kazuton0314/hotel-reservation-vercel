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
  type KeyboardEvent,
} from "react";
import {
  insertMergeChip,
  insertNewlineAtSelection,
  insertPlainTextAtSelection,
  mergeTextToHtml,
  normalizeMergeText,
  placeCaretAtPoint,
  removeAdjacentMergeChip,
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
    const movingChipRef = useRef<HTMLElement | null>(null);
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

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const el = rootRef.current;
      if (!el) return;

      if (e.key === "Enter" && multiline) {
        e.preventDefault();
        insertNewlineAtSelection(el);
        emitChange();
        return;
      }

      if (e.key !== "Backspace" && e.key !== "Delete") return;

      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;

      // 選択範囲にチップが含まれる場合はまとめて除去
      if (!range.collapsed) {
        const chips = el.querySelectorAll(".mail-merge-chip");
        let hit = false;
        chips.forEach((chip) => {
          if (range.intersectsNode(chip)) {
            hit = true;
          }
        });
        if (hit) {
          e.preventDefault();
          range.deleteContents();
          // 消し残ったアンカーを掃除
          Array.from(el.childNodes).forEach((node) => {
            if (
              node.nodeType === Node.TEXT_NODE &&
              node.textContent &&
              /^[\u200B]+$/.test(node.textContent)
            ) {
              // 隣接チップが無い孤立アンカーのみ除去
              const prev = node.previousSibling;
              const next = node.nextSibling;
              const nearChip =
                (prev instanceof HTMLElement &&
                  prev.classList.contains("mail-merge-chip")) ||
                (next instanceof HTMLElement &&
                  next.classList.contains("mail-merge-chip"));
              if (!nearChip) node.parentNode?.removeChild(node);
            }
          });
          emitChange();
          return;
        }
      }

      if (!range.collapsed) return;

      const removed = removeAdjacentMergeChip(
        el,
        range,
        e.key === "Backspace" ? "backward" : "forward"
      );
      if (removed) {
        e.preventDefault();
        emitChange();
      }
    };

    const handleKeyUp = () => {
      // iOS など input イベントが欠ける環境向け
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
      const el = rootRef.current;
      if (!el) return;
      const text = e.clipboardData.getData("text/plain");
      insertPlainTextAtSelection(el, text);
      emitChange();
    };

    const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
      const chip = (e.target as HTMLElement).closest(".mail-merge-chip");
      if (!chip || !rootRef.current?.contains(chip)) return;
      const key = chip.getAttribute("data-merge");
      if (!key) return;
      movingChipRef.current = chip as HTMLElement;
      e.dataTransfer.setData("application/x-mail-merge", key);
      e.dataTransfer.setData("application/x-mail-merge-move", "1");
      e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
      const key = e.dataTransfer.getData("application/x-mail-merge");
      if (!key) return;
      e.preventDefault();
      const el = rootRef.current;
      if (!el) return;
      el.focus();
      const range = placeCaretAtPoint(el, e.clientX, e.clientY);
      const moving = movingChipRef.current;
      const isMove = e.dataTransfer.getData("application/x-mail-merge-move") === "1";
      if (isMove && moving && el.contains(moving)) {
        moving.remove();
        movingChipRef.current = null;
      }
      insertMergeChip(el, key, range);
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
          spellCheck
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("application/x-mail-merge")) {
              e.preventDefault();
            }
          }}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
        />
      </div>
    );
  }
);

export { normalizeMergeText };
