/** 編集画面用の差し込みマーカー（{{}} は DB 互換のため読み取りのみ） */
export const MERGE_OPEN = "⟦";
export const MERGE_CLOSE = "⟧";

const MERGE_BRACKET_RE = /⟦([^⟧]+)⟧/g;
const MERGE_LEGACY_RE = /\{\{([^}]+)\}\}/g;

export function encodeMergeField(key: string): string {
  return `${MERGE_OPEN}${key.trim()}${MERGE_CLOSE}`;
}

/** テンプレート読込時: 旧 {{key}} を ⟦key⟧ に統一 */
export function normalizeMergeText(text: string): string {
  return String(text ?? "").replace(MERGE_LEGACY_RE, (_m, key) =>
    encodeMergeField(String(key ?? "").trim())
  );
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mergeTextToHtml(text: string): string {
  const normalized = normalizeMergeText(text);
  if (!normalized) return "";

  const parts = normalized.split(/(⟦[^⟧]+⟧)/g);
  return parts
    .map((part) => {
      const m = part.match(/^⟦([^⟧]+)⟧$/);
      if (m) {
        const key = m[1];
        return `<span class="mail-merge-chip" data-merge="${escapeHtml(key)}" contenteditable="false" draggable="true">${escapeHtml(key)}</span>`;
      }
      return escapeHtml(part).replace(/\n/g, "<br>");
    })
    .join("");
}

export function serializeMergeEditor(root: HTMLElement): string {
  const lines: string[] = [];
  let current = "";

  const pushLine = () => {
    lines.push(current);
    current = "";
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const mergeKey = el.getAttribute("data-merge");
    if (mergeKey) {
      current += encodeMergeField(mergeKey);
      return;
    }

    if (el.tagName === "BR") {
      pushLine();
      return;
    }

    if (el.tagName === "DIV" || el.tagName === "P") {
      const onlyBr =
        el.childNodes.length === 1 &&
        el.firstChild?.nodeType === Node.ELEMENT_NODE &&
        (el.firstChild as HTMLElement).tagName === "BR";

      if (onlyBr) {
        pushLine();
        return;
      }

      if (current) pushLine();
      else if (el.previousSibling) pushLine();

      el.childNodes.forEach(walk);
      return;
    }

    el.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);
  pushLine();

  while (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

function isMergeChip(node: Node | null): node is HTMLElement {
  return (
    node instanceof HTMLElement && node.classList.contains("mail-merge-chip")
  );
}

/** Backspace/Delete で非編集チップを除去（スマホ対応） */
export function removeAdjacentMergeChip(
  root: HTMLElement,
  range: Range,
  direction: "backward" | "forward"
): boolean {
  const { startContainer, startOffset } = range;
  let chip: HTMLElement | null = null;

  if (startContainer === root) {
    const idx = direction === "backward" ? startOffset - 1 : startOffset;
    const node = root.childNodes[idx] ?? null;
    chip = isMergeChip(node) ? node : null;
  } else if (startContainer.nodeType === Node.TEXT_NODE) {
    const text = startContainer as Text;
    if (direction === "backward" && startOffset === 0) {
      chip = isMergeChip(text.previousSibling) ? text.previousSibling : null;
    } else if (
      direction === "forward" &&
      startOffset === (text.textContent?.length ?? 0)
    ) {
      chip = isMergeChip(text.nextSibling) ? text.nextSibling : null;
    }
  } else if (startContainer.nodeType === Node.ELEMENT_NODE) {
    const el = startContainer as HTMLElement;
    if (direction === "backward" && startOffset === 0) {
      chip = isMergeChip(el.previousSibling) ? el.previousSibling : null;
    } else {
      const child = el.childNodes[
        direction === "backward" ? startOffset - 1 : startOffset
      ] ?? null;
      chip = isMergeChip(child) ? child : null;
    }
  }

  if (!chip || !root.contains(chip)) return false;

  const sel = window.getSelection();
  const restore = chip.nextSibling ?? chip.previousSibling;
  chip.remove();

  if (sel) {
    const r = document.createRange();
    if (restore?.nodeType === Node.TEXT_NODE) {
      const pos =
        direction === "backward"
          ? (restore as Text).textContent?.length ?? 0
          : 0;
      r.setStart(restore, pos);
    } else if (restore) {
      r.setStartBefore(restore);
    } else {
      r.selectNodeContents(root);
      r.collapse(false);
    }
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  return true;
}

export function placeCaretAtPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number
): Range | null {
  const doc = root.ownerDocument;
  let range: Range | null = null;

  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(clientX, clientY);
  } else {
    const caretFromPoint = (
      doc as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number
        ) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint;
    const pos = caretFromPoint?.(clientX, clientY);
    if (pos) {
      range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }

  if (!range || !root.contains(range.commonAncestorContainer)) {
    range = doc.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
  }

  const sel = root.ownerDocument.defaultView?.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }

  return range;
}

export function insertMergeChip(
  root: HTMLElement,
  key: string,
  range?: Range | null
) {
  const chip = document.createElement("span");
  chip.className = "mail-merge-chip";
  chip.setAttribute("data-merge", key);
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("draggable", "true");
  chip.textContent = key;

  const sel = window.getSelection();
  let targetRange = range ?? null;

  if (!targetRange && sel && sel.rangeCount > 0) {
    targetRange = sel.getRangeAt(0);
  }

  if (!targetRange || !root.contains(targetRange.commonAncestorContainer)) {
    root.appendChild(chip);
    return;
  }

  targetRange.deleteContents();
  targetRange.insertNode(chip);
  targetRange.setStartAfter(chip);
  targetRange.collapse(true);
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(targetRange);
  }
}

export function listMergeKeysInText(text: string): string[] {
  const normalized = normalizeMergeText(text);
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = /⟦([^⟧]+)⟧/g;
  while ((m = re.exec(normalized)) !== null) {
    found.add(m[1].trim());
  }
  return [...found];
}
