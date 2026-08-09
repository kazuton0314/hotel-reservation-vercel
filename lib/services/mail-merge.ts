/** 編集画面用の差し込みマーカー（{{}} は DB 互換のため読み取りのみ） */
export const MERGE_OPEN = "⟦";
export const MERGE_CLOSE = "⟧";

/** 行末キャレット用。serialize では除去する */
export const CARET_ANCHOR = "\u200B";

const MERGE_LEGACY_RE = /\{\{([^}]+)\}\}/g;

const DOM_ELEMENT_NODE = 1;
const DOM_TEXT_NODE = 3;

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

function chipHtml(key: string): string {
  return (
    `<span class="mail-merge-chip" data-merge="${escapeHtml(key)}" ` +
    `contenteditable="false" draggable="true">${escapeHtml(key)}</span>`
  );
}

/**
 * プレーンテキスト → エディタ HTML。
 * 改行は <br>。末尾に ZWSP を置き、行末 Enter 後も次行にキャレットが乗る。
 */
export function mergeTextToHtml(text: string): string {
  const normalized = normalizeMergeText(text);
  if (!normalized) return CARET_ANCHOR;

  const parts = normalized.split(/(⟦[^⟧]+⟧)/g);
  let html = parts
    .map((part) => {
      const m = part.match(/^⟦([^⟧]+)⟧$/);
      if (m) return chipHtml(m[1] ?? "");
      return escapeHtml(part).replace(/\r\n?|\n/g, "<br>");
    })
    .join("");

  // 常に末尾へキャレット足場（行末 br / チップ直後でも次入力・Enter 可能）
  if (!html.endsWith(CARET_ANCHOR)) {
    html += CARET_ANCHOR;
  }
  return html;
}

function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === DOM_ELEMENT_NODE;
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === DOM_TEXT_NODE;
}

function isBrNode(node: Node): boolean {
  return isElementNode(node) && node.tagName === "BR";
}

function isBlockNode(node: Node): boolean {
  return isElementNode(node) && (node.tagName === "DIV" || node.tagName === "P");
}

function isMergeChip(node: Node | null): boolean {
  return (
    !!node &&
    isElementNode(node) &&
    node.classList.contains("mail-merge-chip")
  );
}

function stripAnchors(text: string): string {
  return text.replace(/\u200B/g, "");
}

function isEmptyBlock(el: HTMLElement): boolean {
  const kids = Array.from(el.childNodes);
  if (kids.length === 0) return true;
  if (kids.some(isMergeChip)) return false;
  return kids.every(
    (k) =>
      isBrNode(k) ||
      (isTextNode(k) && stripAnchors(k.textContent ?? "").length === 0)
  );
}

/** インライン列を文字列化 */
function serializeInline(
  nodes: Node[],
  options: { collapseTextNewlines: boolean; stripTrailingPaddingBr: boolean }
): string {
  let list = [...nodes];
  if (
    options.stripTrailingPaddingBr &&
    list.length >= 2 &&
    isBrNode(list[list.length - 1]!)
  ) {
    list = list.slice(0, -1);
  }

  let out = "";
  for (const node of list) {
    if (isTextNode(node)) {
      const raw = stripAnchors(node.textContent ?? "").replace(/\r\n?/g, "\n");
      out += options.collapseTextNewlines ? raw.replace(/\n/g, "") : raw;
      continue;
    }
    if (!isElementNode(node)) continue;
    if (isMergeChip(node)) {
      out += encodeMergeField(node.getAttribute("data-merge") ?? "");
      continue;
    }
    if (isBrNode(node)) {
      out += "\n";
      continue;
    }
    if (isBlockNode(node)) {
      if (isEmptyBlock(node)) {
        out += "\n";
        continue;
      }
      if (out && !out.endsWith("\n")) out += "\n";
      out += serializeInline(Array.from(node.childNodes), {
        collapseTextNewlines: true,
        stripTrailingPaddingBr: true,
      });
      continue;
    }
    out += serializeInline(Array.from(node.childNodes), options);
  }
  return out;
}

/**
 * contenteditable DOM → プレーンテキスト。
 * 末尾改行は保持。ZWSP は除去。
 */
export function serializeMergeEditor(root: HTMLElement): string {
  const top = Array.from(root.childNodes).filter((node) => {
    if (!isTextNode(node)) return true;
    const raw = node.textContent ?? "";
    if (/^[\u200B]+$/.test(raw)) return true;
    if (/^[ \t\f\v]+$/.test(raw)) return false;
    return true;
  });

  let out = "";
  if (!top.some(isBlockNode)) {
    out = serializeInline(top, {
      collapseTextNewlines: false,
      stripTrailingPaddingBr: false,
    });
  } else {
    const lines: string[] = [];
    for (const child of top) {
      if (isElementNode(child) && isBlockNode(child)) {
        if (isEmptyBlock(child)) {
          lines.push("");
          continue;
        }
        const piece = serializeInline(Array.from(child.childNodes), {
          collapseTextNewlines: true,
          stripTrailingPaddingBr: true,
        });
        lines.push(...piece.split("\n"));
        continue;
      }
      if (isBrNode(child)) {
        if (lines.length === 0) lines.push("");
        lines.push("");
        continue;
      }
      const piece = serializeInline([child], {
        collapseTextNewlines: true,
        stripTrailingPaddingBr: false,
      });
      if (lines.length === 0) lines.push(...piece.split("\n"));
      else {
        const parts = piece.split("\n");
        lines[lines.length - 1] =
          (lines[lines.length - 1] ?? "") + (parts[0] ?? "");
        lines.push(...parts.slice(1));
      }
    }
    out = lines.join("\n");
  }

  out = stripAnchors(out);
  if (!/⟦/.test(out) && out.replace(/\n/g, "").length === 0) return "";
  return out;
}

/** DOM 位置までのプレーンテキストオフセット */
export function getPlainOffsetAt(
  root: HTMLElement,
  node: Node | null,
  offset: number
): number {
  if (!node || !root.contains(node)) {
    return serializeMergeEditor(root).length;
  }
  try {
    const pre = root.ownerDocument.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(node, offset);
    const holder = root.ownerDocument.createElement("div");
    holder.appendChild(pre.cloneContents());
    return serializeMergeEditor(holder).length;
  } catch {
    return serializeMergeEditor(root).length;
  }
}

/** キャレット（または選択の始点）のプレーンテキストオフセット */
export function getPlainCaretOffset(root: HTMLElement): number {
  const sel = root.ownerDocument.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode) {
    return serializeMergeEditor(root).length;
  }
  return getPlainOffsetAt(root, sel.anchorNode, sel.anchorOffset);
}

/** 選択範囲のプレーンテキストオフセット（start <= end） */
export function getPlainSelectionOffsets(root: HTMLElement): {
  start: number;
  end: number;
} {
  const sel = root.ownerDocument.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) {
    const n = serializeMergeEditor(root).length;
    return { start: n, end: n };
  }
  const a = getPlainOffsetAt(root, sel.anchorNode, sel.anchorOffset);
  const b = getPlainOffsetAt(root, sel.focusNode, sel.focusOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/** 選択範囲を insertion で置き換える */
export function replacePlainRange(
  text: string,
  start: number,
  end: number,
  insertion: string
): { text: string; caret: number } {
  const value = normalizeMergeText(text);
  const a = Math.max(0, Math.min(start, value.length));
  const b = Math.max(a, Math.min(end, value.length));
  const ins = String(insertion ?? "").replace(/\r\n?/g, "\n");
  return {
    text: value.slice(0, a) + ins + value.slice(b),
    caret: a + ins.length,
  };
}

export function setPlainCaretOffset(root: HTMLElement, plainOffset: number): void {
  const target = Math.max(0, plainOffset);
  let remaining = target;
  let focusNode: Node | null = null;
  let focusOffset = 0;
  let found = false;

  const parentOf = (node: Node): Node | null => node.parentNode;

  const consumeText = (node: Text): boolean => {
    const raw = node.textContent ?? "";
    for (let i = 0; i <= raw.length; i++) {
      if (remaining <= 0) {
        focusNode = node;
        focusOffset = i;
        return true;
      }
      if (i === raw.length) break;
      const ch = raw[i]!;
      if (ch === "\u200B") continue;
      remaining -= 1;
    }
    return false;
  };

  const walk = (node: Node): boolean => {
    if (isTextNode(node)) return consumeText(node);
    if (!isElementNode(node)) return false;
    if (isMergeChip(node)) {
      const el = node as HTMLElement;
      const len = encodeMergeField(el.getAttribute("data-merge") ?? "").length;
      if (remaining <= 0) {
        focusNode = parentOf(el);
        focusOffset = focusNode
          ? Array.from(focusNode.childNodes).indexOf(el)
          : 0;
        return true;
      }
      if (remaining < len) {
        remaining = 0;
        focusNode = parentOf(el);
        focusOffset = focusNode
          ? Array.from(focusNode.childNodes).indexOf(el) + 1
          : 0;
        return true;
      }
      remaining -= len;
      return false;
    }
    if (isBrNode(node)) {
      if (remaining <= 0) {
        focusNode = parentOf(node);
        focusOffset = focusNode
          ? Array.from(focusNode.childNodes).indexOf(node as ChildNode)
          : 0;
        return true;
      }
      remaining -= 1;
      if (remaining <= 0) {
        focusNode = parentOf(node);
        focusOffset = focusNode
          ? Array.from(focusNode.childNodes).indexOf(node as ChildNode) + 1
          : 0;
        return true;
      }
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) {
      found = true;
      break;
    }
  }

  const sel = root.ownerDocument.defaultView?.getSelection();
  if (!sel) return;
  const range = root.ownerDocument.createRange();

  if (found && focusNode) {
    try {
      const node: Node = focusNode;
      if (isTextNode(node)) {
        range.setStart(
          node,
          Math.min(focusOffset, node.textContent?.length ?? 0)
        );
      } else if (isElementNode(node)) {
        range.setStart(
          node,
          Math.min(focusOffset, node.childNodes.length)
        );
      } else {
        range.selectNodeContents(root);
        range.collapse(false);
      }
    } catch {
      range.selectNodeContents(root);
      range.collapse(false);
    }
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function insertPlainNewline(
  text: string,
  start: number,
  end: number = start
): { text: string; caret: number } {
  return replacePlainRange(text, start, end, "\n");
}

export function insertPlainToken(
  text: string,
  start: number,
  key: string,
  end: number = start
): { text: string; caret: number } {
  return replacePlainRange(text, start, end, encodeMergeField(key));
}

export function insertPlainText(
  text: string,
  start: number,
  insertion: string,
  end: number = start
): { text: string; caret: number } {
  return replacePlainRange(text, start, end, insertion);
}

export function deleteChipBeforeCaret(
  text: string,
  caret: number
): { text: string; caret: number } | null {
  const value = normalizeMergeText(text);
  const at = Math.max(0, Math.min(caret, value.length));
  const m = value.slice(0, at).match(/⟦[^⟧]+⟧$/);
  if (!m) return null;
  const start = at - m[0].length;
  return { text: value.slice(0, start) + value.slice(at), caret: start };
}

export function deleteChipAfterCaret(
  text: string,
  caret: number
): { text: string; caret: number } | null {
  const value = normalizeMergeText(text);
  const at = Math.max(0, Math.min(caret, value.length));
  const m = value.slice(at).match(/^⟦[^⟧]+⟧/);
  if (!m) return null;
  return {
    text: value.slice(0, at) + value.slice(at + m[0].length),
    caret: at,
  };
}

export function renderMergeEditor(
  root: HTMLElement,
  text: string,
  caret: number
): void {
  root.innerHTML = mergeTextToHtml(text);
  setPlainCaretOffset(root, caret);
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
