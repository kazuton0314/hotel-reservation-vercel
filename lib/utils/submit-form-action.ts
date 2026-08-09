import type { FormEvent } from "react";

/**
 * React 19 の form `action={fn}` は送信後に <select> を初期値へ戻す。
 * preventDefault して FormData を渡すと automatic reset を回避できる。
 * あわせて DOM 上の select/input 値を FormData に明示反映し、
 * スマホで controlled/hidden とネイティブ選択がずれる事故を防ぐ。
 */
export function submitFormAction(
  formAction: (formData: FormData) => void | Promise<void>,
  options?: {
    beforeSubmit?: (form: HTMLFormElement, formData: FormData) => void;
  }
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    // namedItem で DOM の現値を優先して載せ直す（iOS の選択確定ずれ対策）
    for (const element of Array.from(form.elements)) {
      if (
        !(element instanceof HTMLInputElement) &&
        !(element instanceof HTMLSelectElement) &&
        !(element instanceof HTMLTextAreaElement)
      ) {
        continue;
      }
      if (!element.name || element.disabled) continue;
      if (element instanceof HTMLInputElement) {
        if (element.type === "file") continue;
        if (element.type === "checkbox" || element.type === "radio") {
          continue;
        }
        if (element.type === "hidden") {
          // 同名の visible control があれば hidden よりそちらを優先
          const named = form.elements.namedItem(element.name);
          if (named && named !== element) continue;
        }
      }
      formData.set(element.name, element.value);
    }

    options?.beforeSubmit?.(form, formData);
    void formAction(formData);
  };
}
