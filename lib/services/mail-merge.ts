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

const DOM_ELEMENT_NODE = 1;
const DOM_TEXT_NODE = 3;

function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === DOM_ELEMENT_NODE;
}

function isBrNode(node: Node): boolean {
  return isElementNode(node) && node.tagName === "BR";
}

function isBlockNode(node: Node): boolean {
  return isElementNode(node) && (node.tagName === "DIV" || node.tagName === "P");
}

function isEmptyBlock(el: HTMLElement): boolean {
  const kids = el.childNodes;
  if (kids.length === 0) return true;
  return kids.length === 1 && isBrNode(kids[0]!);
}

/**
 * contenteditable の DOM をプレーンテキストへ戻す。
 *
 * Chrome は行を <div> で包み、空行を <div><br></div>、非空ブロック末尾に
 * キャレット用の <br> を付けることがある。ブロック境界と <br> を二重に数えると
 * 保存のたびに改行が増えるため、末尾の padding <br> は無視する。
 */
export function serializeMergeEditor(root: HTMLElement): string {
  const lines: string[] = [];
  let current = "";

  const flush = () => {
    lines.push(current);
    current = "";
  };

  const appendInlineNodes = (
    nodes: Node[],
    options: { stripTrailingPaddingBr: boolean }
  ) => {
    let list = nodes;
    if (
      options.stripTrailingPaddingBr &&
      list.length >= 2 &&
      isBrNode(list[list.length - 1]!)
    ) {
      list = list.slice(0, -1);
    }

    for (const node of list) {
      if (node.nodeType === DOM_TEXT_NODE) {
        current += node.textContent ?? "";
        continue;
      }
      if (!isElementNode(node)) continue;

      const mergeKey = node.getAttribute("data-merge");
      if (mergeKey) {
        current += encodeMergeField(mergeKey);
        continue;
      }

      if (isBrNode(node)) {
        flush();
        continue;
      }

      if (isBlockNode(node)) {
        // 稀なネストブロックは行境界として扱う
        if (isEmptyBlock(node)) {
          flush();
          continue;
        }
        if (current) flush();
        appendInlineNodes(Array.from(node.childNodes), {
          stripTrailingPaddingBr: true,
        });
        flush();
        continue;
      }

      appendInlineNodes(Array.from(node.childNodes), {
        stripTrailingPaddingBr: false,
      });
    }
  };

  const top = Array.from(root.childNodes).filter((node) => {
    if (node.nodeType !== DOM_TEXT_NODE) return true;
    // ブロック間の整形用ホワイトスペースは無視
    return Boolean((node.textContent ?? "").replace(/\s+/g, "").length);
  });
  const usesBlocks = top.some(isBlockNode);

  if (!usesBlocks) {
    appendInlineNodes(top, { stripTrailingPaddingBr: false });
    flush();
  } else {
    for (const child of top) {
      if (isBlockNode(child)) {
        if (isEmptyBlock(child)) {
          flush();
          continue;
        }
        if (current) flush();
        appendInlineNodes(Array.from(child.childNodes), {
          stripTrailingPaddingBr: true,
        });
        flush();
        continue;
      }

      if (isBrNode(child)) {
        flush();
        continue;
      }

      if (child.nodeType === DOM_TEXT_NODE) {
        current += child.textContent ?? "";
        continue;
      }

      if (isElementNode(child)) {
        appendInlineNodes([child], { stripTrailingPaddingBr: false });
      }
    }
    if (current) flush();
  }

  // 末尾の空行は 1 つまで残す（連続しすぎた保存崩れの吸収はしない）
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
