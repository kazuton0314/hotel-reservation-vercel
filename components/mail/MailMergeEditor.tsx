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
  mergeTextToHtml,
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

/**
 * 通常の文字入力はブラウザの contenteditable に任せ、DOM を書き換えない。
 * Enter / 貼付け / チップ操作だけテキストモデル経由で再描画する。
 * （入力のたびに innerHTML を戻すと入力不能になる）
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
    const lastValueRef = useRef(normalizeMergeText(value));
    const movingChipRef = useRef<HTMLElement | null>(null);
    const [empty, setEmpty] = useState(!normalizeMergeText(value).trim());

    const emitOnly = useCallback(
      (next: string) => {
        const normalized = normalizeMergeText(next);
        lastValueRef.current = normalized;
        setEmpty(!normalized.trim());
        onChange(normalized);
        return normalized;
      },
      [onChange]
    );

    /** Enter / 貼付け / チップなど、DOM をテキストから描き直す操作 */
    const commitRender = useCallback(
      (next: string, caret: number) => {
        const el = rootRef.current;
        const normalized = emitOnly(next);
        if (el) renderMergeEditor(el, normalized, caret);
        return normalized;
      },
      [emitOnly]
    );

    useEffect(() => {
      const el = rootRef.current;
      if (!el) return;
      const normalized = normalizeMergeText(value);

      // フォーカス中は props からの DOM 上書きをしない（入力を壊す）
      if (focusedRef.current) {
        lastValueRef.current = normalized;
        setEmpty(!normalized.trim());
        return;
      }

      if (
        normalized === lastValueRef.current &&
        el.childNodes.length > 0
      ) {
        setEmpty(!normalized.trim());
        return;
      }

      lastValueRef.current = normalized;
      setEmpty(!normalized.trim());
      el.innerHTML = mergeTextToHtml(normalized);
    }, [value]);

    useImperativeHandle(ref, () => ({
      insertKey(key: string) {
        const el = rootRef.current;
        if (!el) return lastValueRef.current;
        el.focus();
        focusedRef.current = true;
        const base = serializeMergeEditor(el);
        lastValueRef.current = base;
        const { start, end } = getPlainSelectionOffsets(el);
        const next = insertPlainToken(base, start, key, end);
        return commitRender(next.text, next.caret);
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

    const handleInput = () => {
      if (composingRef.current) return;
      const el = rootRef.current;
      if (!el) return;
      // 文字入力中は DOM を触らず値だけ同期
      emitOnly(serializeMergeEditor(el));
    };

    const handleCompositionStart = () => {
      composingRef.current = true;
    };

    const handleCompositionEnd = () => {
      composingRef.current = false;
      const el = rootRef.current;
      if (!el) return;
      emitOnly(serializeMergeEditor(el));
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
        commitRender(next.text, next.caret);
        return;
      }

      if (e.key === "Backspace") {
        const text = syncTextFromDom();
        const { start, end } = getPlainSelectionOffsets(el);
        if (start !== end) return;
        const chipDel = deleteChipBeforeCaret(text, start);
        if (chipDel) {
          e.preventDefault();
          commitRender(chipDel.text, chipDel.caret);
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
          commitRender(chipDel.text, chipDel.caret);
        }
      }
    };

    const handleFocus = () => {
      focusedRef.current = true;
      onFocus?.();
    };

    const handleBlur = () => {
      focusedRef.current = false;
      if (composingRef.current) return;
      const el = rootRef.current;
      if (!el) return;
      // ぼかし時だけ正規化描画（Chrome の div 巻き込みを解消）
      const serialized = serializeMergeEditor(el);
      const caret = serialized.length;
      commitRender(serialized, caret);
    };

    const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = rootRef.current;
      if (!el) return;
      const base = syncTextFromDom();
      const { start, end } = getPlainSelectionOffsets(el);
      const text = e.clipboardData.getData("text/plain");
      const next = insertPlainText(base, start, text, end);
      commitRender(next.text, next.caret);
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

      let base = syncTextFromDom();
      const moving = movingChipRef.current;
      const isMove =
        e.dataTransfer.getData("application/x-mail-merge-move") === "1";
      if (isMove && moving && el.contains(moving)) {
        const token = `⟦${key}⟧`;
        const dropCaret = getPlainCaretOffset(el);
        const from = base.indexOf(token);
        if (from >= 0) {
          base = base.slice(0, from) + base.slice(from + token.length);
          const adjusted =
            dropCaret > from ? Math.max(from, dropCaret - token.length) : dropCaret;
          const next = insertPlainToken(base, adjusted, key);
          movingChipRef.current = null;
          commitRender(next.text, next.caret);
          return;
        }
        movingChipRef.current = null;
      }

      const { start, end } = getPlainSelectionOffsets(el);
      const next = insertPlainToken(base, start, key, end);
      commitRender(next.text, next.caret);
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
