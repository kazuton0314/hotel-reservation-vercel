"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  deleteChipAfterCaret,
  deleteChipBeforeCaret,
  getPlainCaretOffset,
  getPlainSelectionOffsets,
  insertPlainNewline,
  insertPlainText,
  insertPlainToken,
  normalizeMergeText,
  placeCaretAtPoint,
  renderMergeEditor,
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
    const composingRef = useRef(false);
    const lastValueRef = useRef(normalizeMergeText(value));
    const movingChipRef = useRef<HTMLElement | null>(null);
    const [empty, setEmpty] = useState(!normalizeMergeText(value).trim());

    const commit = useCallback(
      (next: string, caret: number) => {
        const el = rootRef.current;
        const normalized = normalizeMergeText(next);
        lastValueRef.current = normalized;
        setEmpty(!normalized.trim());
        onChange(normalized);
        if (el) {
          renderMergeEditor(el, normalized, caret);
        }
        return normalized;
      },
      [onChange]
    );

    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      const normalized = normalizeMergeText(value);
      const domReady = el.childNodes.length > 0;
      // 自分の commit 直後で DOM も既に描画済みならスキップ
      if (normalized === lastValueRef.current && domReady) {
        setEmpty(!normalized.trim());
        return;
      }
      const caret = focusedRef.current
        ? getPlainCaretOffset(el)
        : normalized.length;
      lastValueRef.current = normalized;
      setEmpty(!normalized.trim());
      renderMergeEditor(el, normalized, caret);
    }, [value]);

    useImperativeHandle(ref, () => ({
      insertKey(key: string) {
        const el = rootRef.current;
        if (!el) return lastValueRef.current;
        el.focus();
        focusedRef.current = true;
        const { start, end } = getPlainSelectionOffsets(el);
        const next = insertPlainToken(lastValueRef.current, start, key, end);
        return commit(next.text, next.caret);
      },
      focus() {
        rootRef.current?.focus();
      },
    }));

    const syncTextFromDom = () => {
      const el = rootRef.current;
      if (!el) return lastValueRef.current;
      const serialized = serializeMergeEditor(el);
      lastValueRef.current = serialized;
      return serialized;
    };

    const readAndNormalize = () => {
      const el = rootRef.current;
      if (!el) return;
      const caret = getPlainCaretOffset(el);
      const serialized = serializeMergeEditor(el);
      commit(serialized, caret);
    };

    const handleInput = () => {
      if (composingRef.current) return;
      readAndNormalize();
    };

    const handleCompositionStart = () => {
      composingRef.current = true;
    };

    const handleCompositionEnd = (_e: CompositionEvent<HTMLDivElement>) => {
      composingRef.current = false;
      readAndNormalize();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const el = rootRef.current;
      if (!el) return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (!multiline) return;
        const text = syncTextFromDom();
        const { start, end } = getPlainSelectionOffsets(el);
        const next = insertPlainNewline(text, start, end);
        commit(next.text, next.caret);
        return;
      }

      if (e.key === "Backspace") {
        const text = syncTextFromDom();
        const { start, end } = getPlainSelectionOffsets(el);
        if (start !== end) return; // 選択削除はブラウザ＋input に任せる
        const chipDel = deleteChipBeforeCaret(text, start);
        if (chipDel) {
          e.preventDefault();
          commit(chipDel.text, chipDel.caret);
        }
        return;
      }

      if (e.key === "Delete") {
        const text = syncTextFromDom();
        const { start, end } = getPlainSelectionOffsets(el);
        if (start !== end) return;
        const chipDel = deleteChipAfterCaret(text, start);
        if (chipDel) {
          e.preventDefault();
          commit(chipDel.text, chipDel.caret);
        }
      }
    };

    const handleFocus = (_e: FocusEvent<HTMLDivElement>) => {
      focusedRef.current = true;
      onFocus?.();
    };

    const handleBlur = () => {
      focusedRef.current = false;
      if (!composingRef.current) {
        readAndNormalize();
      }
    };

    const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = rootRef.current;
      if (!el) return;
      const base = syncTextFromDom();
      const { start, end } = getPlainSelectionOffsets(el);
      const text = e.clipboardData.getData("text/plain");
      const next = insertPlainText(base, start, text, end);
      commit(next.text, next.caret);
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
      placeCaretAtPoint(el, e.clientX, e.clientY);

      let base = lastValueRef.current;
      const moving = movingChipRef.current;
      const isMove =
        e.dataTransfer.getData("application/x-mail-merge-move") === "1";
      if (isMove && moving && el.contains(moving)) {
        // いったん現 DOM を serialize し、移動元チップを除去してから挿入
        const token = `⟦${key}⟧`;
        // ドロップ位置を先に取得するため、移動前のキャレットを使う
        const dropCaret = getPlainCaretOffset(el);
        const from = base.indexOf(token);
        if (from >= 0) {
          base = base.slice(0, from) + base.slice(from + token.length);
          const adjusted =
            dropCaret > from ? Math.max(from, dropCaret - token.length) : dropCaret;
          const next = insertPlainToken(base, adjusted, key);
          movingChipRef.current = null;
          commit(next.text, next.caret);
          return;
        }
        movingChipRef.current = null;
      }

      const { start, end } = getPlainSelectionOffsets(el);
      const next = insertPlainToken(base, start, key, end);
      commit(next.text, next.caret);
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
