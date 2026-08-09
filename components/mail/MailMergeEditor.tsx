"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  getPlainCaretOffset,
  insertMergeChip,
  insertNewlineAtSelection,
  insertPlainTextAtSelection,
  mergeTextToHtml,
  normalizeMergeText,
  placeCaretAtPoint,
  removeAdjacentMergeChip,
  serializeMergeEditor,
  setPlainCaretOffset,
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
 * 差し込みチップ（ピル）付きエディタ。
 *
 * - フォーカス中は props で innerHTML を上書きしない
 * - 差し込みバークリックで blur しても、保存したキャレット位置へ挿入する
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
    const rootRef = useRef<HTMLDivElement>(null);
    const focusedRef = useRef(false);
    const composingRef = useRef(false);
    const lastEmittedRef = useRef(normalizeMergeText(value));
    const savedCaretRef = useRef<number>(0);
    const movingChipRef = useRef<HTMLElement | null>(null);
    const [empty, setEmpty] = useState(!normalizeMergeText(value).trim());

    const rememberCaret = () => {
      const el = rootRef.current;
      if (!el) return;
      const sel = el.ownerDocument.defaultView?.getSelection();
      if (!sel?.anchorNode || !el.contains(sel.anchorNode)) return;
      savedCaretRef.current = getPlainCaretOffset(el);
    };

    const emitFromDom = () => {
      const el = rootRef.current;
      if (!el) return lastEmittedRef.current;
      const serialized = serializeMergeEditor(el);
      lastEmittedRef.current = serialized;
      setEmpty(!serialized.trim());
      onChange(serialized);
      return serialized;
    };

    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      const normalized = normalizeMergeText(value);

      if (focusedRef.current) {
        lastEmittedRef.current = normalized;
        setEmpty(!normalized.trim());
        return;
      }

      if (
        normalized === lastEmittedRef.current &&
        el.childNodes.length > 0
      ) {
        setEmpty(!normalized.trim());
        return;
      }

      lastEmittedRef.current = normalized;
      setEmpty(!normalized.trim());
      el.innerHTML = mergeTextToHtml(normalized);
    }, [value]);

    // 編集中のキャレット位置を常に記憶（差し込みバー押下で blur しても復元できる）
    useEffect(() => {
      const onSelectionChange = () => {
        if (!focusedRef.current) return;
        rememberCaret();
      };
      document.addEventListener("selectionchange", onSelectionChange);
      return () => {
        document.removeEventListener("selectionchange", onSelectionChange);
      };
    }, []);

    useImperativeHandle(ref, () => ({
      insertKey(key: string) {
        const el = rootRef.current;
        if (!el) return lastEmittedRef.current;

        const sel = el.ownerDocument.defaultView?.getSelection();
        const selectionInEditor =
          !!sel?.anchorNode && el.contains(sel.anchorNode);

        el.focus();
        focusedRef.current = true;

        if (selectionInEditor) {
          // mousedown preventDefault 済みなら選択が残っている
        } else {
          // blur 済み: 保存済みオフセットへ復元（未保存なら末尾）
          const max = serializeMergeEditor(el).length;
          const caret = Math.max(0, Math.min(savedCaretRef.current, max));
          setPlainCaretOffset(el, caret);
        }

        insertMergeChip(el, key);
        rememberCaret();
        return emitFromDom();
      },
      focus() {
        rootRef.current?.focus();
      },
    }));

    const handleInput = () => {
      if (composingRef.current) return;
      rememberCaret();
      emitFromDom();
    };

    const handleCompositionStart = () => {
      composingRef.current = true;
    };

    const handleCompositionEnd = () => {
      composingRef.current = false;
      rememberCaret();
      emitFromDom();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const el = rootRef.current;
      if (!el) return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (!multiline) return;
        insertNewlineAtSelection(el);
        rememberCaret();
        emitFromDom();
        return;
      }

      if (e.key === "Backspace") {
        if (removeAdjacentMergeChip(el, "backward")) {
          e.preventDefault();
          rememberCaret();
          emitFromDom();
        }
        return;
      }

      if (e.key === "Delete") {
        if (removeAdjacentMergeChip(el, "forward")) {
          e.preventDefault();
          rememberCaret();
          emitFromDom();
        }
      }
    };

    const handleFocus = () => {
      focusedRef.current = true;
      rememberCaret();
      onFocus?.();
    };

    const handleBlur = () => {
      rememberCaret();
      focusedRef.current = false;
      if (composingRef.current) return;
      const serialized = emitFromDom();
      const el = rootRef.current;
      if (el) {
        el.innerHTML = mergeTextToHtml(serialized);
      }
    };

    const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = rootRef.current;
      if (!el) return;
      const text = e.clipboardData.getData("text/plain");
      if (!multiline) {
        insertPlainTextAtSelection(el, text.replace(/\r\n?|\n/g, " "));
      } else {
        insertPlainTextAtSelection(el, text);
      }
      rememberCaret();
      emitFromDom();
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
      focusedRef.current = true;
      const range = placeCaretAtPoint(el, e.clientX, e.clientY);
      const moving = movingChipRef.current;
      const isMove =
        e.dataTransfer.getData("application/x-mail-merge-move") === "1";
      if (isMove && moving && el.contains(moving)) {
        const prev = moving.previousSibling;
        const next = moving.nextSibling;
        if (
          prev?.nodeType === Node.TEXT_NODE &&
          /^[\u200B]+$/.test(prev.textContent ?? "")
        ) {
          prev.parentNode?.removeChild(prev);
        }
        if (
          next?.nodeType === Node.TEXT_NODE &&
          /^[\u200B]+$/.test(next.textContent ?? "")
        ) {
          next.parentNode?.removeChild(next);
        }
        moving.remove();
        movingChipRef.current = null;
      }
      insertMergeChip(el, key, range);
      rememberCaret();
      emitFromDom();
    };

    return (
      <div
        className={`mail-merge-editor-wrap${empty ? " is-empty" : ""}${multiline ? "" : " mail-merge-editor-wrap-single"}`}
      >
        {placeholder && empty ? (
          <span className="mail-merge-placeholder" aria-hidden>
            {placeholder}
          </span>
        ) : null}
        <div
          id={id}
          ref={rootRef}
          className={`mail-merge-editor ${multiline ? "" : "mail-merge-editor-single"} ${className}`.trim()}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={ariaLabel}
          aria-multiline={multiline}
          spellCheck
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={rememberCaret}
          onMouseUp={rememberCaret}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
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
