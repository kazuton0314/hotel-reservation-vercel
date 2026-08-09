/** 編集画面用の差し込みマーカー（{{}} は DB 互換のため読み取りのみ） */
export const MERGE_OPEN = "⟦";
export const MERGE_CLOSE = "⟧";

/** チップ前後・行末のキャレット足場。serialize 時は除去 */
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
    `${CARET_ANCHOR}<span class="mail-merge-chip" data-merge="${escapeHtml(key)}" ` +
    `contenteditable="false" draggable="true">${escapeHtml(key)}</span>${CARET_ANCHOR}`
  );
}

/**
 * プレーンテキスト → エディタ HTML（チップ見た目を維持）。
 * 改行は <br>。空は <br>。末尾改行のあとに ZWSP。
 */
export function mergeTextToHtml(text: string): string {
  const normalized = normalizeMergeText(text);
  if (!normalized) return "<br>";

  const parts = normalized.split(/(⟦[^⟧]+⟧)/g);
  let html = parts
    .map((part) => {
      const m = part.match(/^⟦([^⟧]+)⟧$/);
      if (m) return chipHtml(m[1] ?? "");
      return escapeHtml(part).replace(/\r\n?|\n/g, "<br>");
    })
    .join("");

  if (html.endsWith("<br>")) html += CARET_ANCHOR;
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

function isAnchorOnlyText(node: Node | null): node is Text {
  return (
    !!node &&
    isTextNode(node) &&
    (node.textContent ?? "").length > 0 &&
    /^[\u200B]+$/.test(node.textContent ?? "")
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

/** contenteditable DOM → プレーンテキスト（末尾改行保持、二重化しない） */
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

function placeCaretAfter(node: Node): void {
  const sel = node.ownerDocument?.defaultView?.getSelection();
  if (!sel) return;
  const range = node.ownerDocument!.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function getSelectionRange(root: HTMLElement): Range | null {
  const sel = root.ownerDocument.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return range;
}

/** 現在キャレットのプレーンテキストオフセット（チップ挿入位置の保存用） */
export function getPlainCaretOffset(root: HTMLElement): number {
  const sel = root.ownerDocument.defaultView?.getSelection();
  if (!sel || !sel.anchorNode || !root.contains(sel.anchorNode)) {
    return serializeMergeEditor(root).length;
  }
  try {
    const pre = root.ownerDocument.createRange();
    pre.selectNodeContents(root);
    pre.setEnd(sel.anchorNode, sel.anchorOffset);
    const holder = root.ownerDocument.createElement("div");
    holder.appendChild(pre.cloneContents());
    return serializeMergeEditor(holder).length;
  } catch {
    return serializeMergeEditor(root).length;
  }
}

/** プレーンテキストオフセットへキャレットを復元 */
export function setPlainCaretOffset(root: HTMLElement, plainOffset: number): void {
  let remaining = Math.max(0, plainOffset);
  let focusNode: Node | null = null;
  let focusOffset = 0;
  let found = false;

  const visitText = (node: Text): boolean => {
    const raw = node.textContent ?? "";
    for (let i = 0; i <= raw.length; i++) {
      if (remaining <= 0) {
        focusNode = node;
        focusOffset = i;
        return true;
      }
      if (i === raw.length) break;
      if (raw[i] === "\u200B") continue;
      remaining -= 1;
    }
    return false;
  };

  const walk = (node: Node): boolean => {
    if (isTextNode(node)) return visitText(node);
    if (!isElementNode(node)) return false;
    if (isMergeChip(node)) {
      const len = encodeMergeField(node.getAttribute("data-merge") ?? "").length;
      if (remaining <= 0) {
        focusNode = node.parentNode;
        focusOffset = focusNode
          ? Array.from(focusNode.childNodes).indexOf(node)
          : 0;
        return true;
      }
      if (remaining < len) {
        remaining = 0;
        focusNode = node.parentNode;
        focusOffset = focusNode
          ? Array.from(focusNode.childNodes).indexOf(node) + 1
          : 0;
        return true;
      }
      remaining -= len;
      return false;
    }
    if (isBrNode(node)) {
      if (remaining <= 0) {
        focusNode = node.parentNode;
        focusOffset = focusNode
          ? Array.from(focusNode.childNodes).indexOf(node as ChildNode)
          : 0;
        return true;
      }
      remaining -= 1;
      if (remaining <= 0) {
        focusNode = node.parentNode;
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

/** Enter: <br> を挿入。行末なら ZWSP を付けて次行にキャレットを置く */
export function insertNewlineAtSelection(root: HTMLElement): boolean {
  const sel = root.ownerDocument.defaultView?.getSelection();
  const range = getSelectionRange(root);
  if (!sel || !range) return false;

  range.deleteContents();
  const doc = root.ownerDocument;
  const br = doc.createElement("br");
  range.insertNode(br);

  // 行末（あとに実質コンテンツがない）ではキャレット足場が必要
  let probe: Node | null = br.nextSibling;
  while (probe && isAnchorOnlyText(probe)) probe = probe.nextSibling;
  const atEnd = !probe;

  if (atEnd) {
    const zw = doc.createTextNode(CARET_ANCHOR);
    br.parentNode?.insertBefore(zw, br.nextSibling);
    // キャレットを ZWSP 内へ
    const r = doc.createRange();
    r.setStart(zw, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  } else {
    placeCaretAfter(br);
  }
  return true;
}

export function insertPlainTextAtSelection(
  root: HTMLElement,
  text: string
): boolean {
  const sel = root.ownerDocument.defaultView?.getSelection();
  const range = getSelectionRange(root);
  if (!sel || !range) return false;

  range.deleteContents();
  const doc = root.ownerDocument;
  const frag = doc.createDocumentFragment();
  const parts = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  parts.forEach((part, i) => {
    if (part) frag.appendChild(doc.createTextNode(part));
    if (i < parts.length - 1) frag.appendChild(doc.createElement("br"));
  });
  const last = frag.lastChild;
  range.insertNode(frag);
  if (last) placeCaretAfter(last);
  return true;
}

function createChipElement(doc: Document, key: string): HTMLElement {
  const chip = doc.createElement("span");
  chip.className = "mail-merge-chip";
  chip.setAttribute("data-merge", key);
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("draggable", "true");
  chip.textContent = key;
  return chip;
}

/** チップをキャレット位置へ挿入（見た目のピルを維持） */
export function insertMergeChip(
  root: HTMLElement,
  key: string,
  range?: Range | null
): void {
  const doc = root.ownerDocument;
  const before = doc.createTextNode(CARET_ANCHOR);
  const chip = createChipElement(doc, key);
  const after = doc.createTextNode(CARET_ANCHOR);
  const sel = doc.defaultView?.getSelection();

  let target = range ?? getSelectionRange(root);

  // 選択がエディタ外／先頭固定になっているときは末尾へ（先頭誤挿入を防ぐ）
  if (!target) {
    target = doc.createRange();
    target.selectNodeContents(root);
    target.collapse(false);
  }

  target.deleteContents();
  const frag = doc.createDocumentFragment();
  frag.appendChild(before);
  frag.appendChild(chip);
  frag.appendChild(after);
  target.insertNode(frag);

  if (sel) {
    const r = doc.createRange();
    r.setStart(after, after.textContent?.length ?? 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

function skipAnchors(
  start: Node | null,
  direction: "backward" | "forward"
): Node | null {
  let n = start;
  while (n && isAnchorOnlyText(n)) {
    n = direction === "backward" ? n.previousSibling : n.nextSibling;
  }
  return n;
}

/** キャレット隣接のチップを削除 */
export function removeAdjacentMergeChip(
  root: HTMLElement,
  direction: "backward" | "forward"
): boolean {
  const range = getSelectionRange(root);
  if (!range || !range.collapsed) return false;

  const { startContainer, startOffset } = range;
  let chip: HTMLElement | null = null;

  if (startContainer === root) {
    const idx = direction === "backward" ? startOffset - 1 : startOffset;
    const node = skipAnchors(root.childNodes[idx] ?? null, direction);
    chip = isMergeChip(node) ? (node as HTMLElement) : null;
  } else if (isTextNode(startContainer)) {
    const value = startContainer.textContent ?? "";
    if (direction === "backward") {
      const before = value.slice(0, startOffset);
      if (stripAnchors(before).length > 0) return false;
      const node = skipAnchors(startContainer.previousSibling, "backward");
      chip = isMergeChip(node) ? (node as HTMLElement) : null;
    } else {
      const after = value.slice(startOffset);
      if (stripAnchors(after).length > 0) return false;
      const node = skipAnchors(startContainer.nextSibling, "forward");
      chip = isMergeChip(node) ? (node as HTMLElement) : null;
    }
  } else if (isElementNode(startContainer)) {
    if (direction === "backward") {
      const node = skipAnchors(
        startOffset === 0
          ? startContainer.previousSibling
          : startContainer.childNodes[startOffset - 1] ?? null,
        "backward"
      );
      chip = isMergeChip(node) ? (node as HTMLElement) : null;
    } else {
      const node = skipAnchors(
        startContainer.childNodes[startOffset] ?? null,
        "forward"
      );
      chip = isMergeChip(node) ? (node as HTMLElement) : null;
    }
  }

  if (!chip || !root.contains(chip)) return false;

  const prev = chip.previousSibling;
  const next = chip.nextSibling;
  if (isAnchorOnlyText(prev)) prev.remove();
  if (isAnchorOnlyText(next)) next.remove();

  const restore =
    direction === "backward" ? chip.previousSibling : chip.nextSibling;
  chip.remove();

  const sel = root.ownerDocument.defaultView?.getSelection();
  if (sel) {
    const r = root.ownerDocument.createRange();
    if (restore && isTextNode(restore)) {
      r.setStart(
        restore,
        direction === "backward" ? restore.textContent?.length ?? 0 : 0
      );
    } else if (restore) {
      if (direction === "backward") r.setStartAfter(restore);
      else r.setStartBefore(restore);
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

  const sel = doc.defaultView?.getSelection();
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
