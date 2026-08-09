/** 編集画面用の差し込みマーカー（{{}} は DB 互換のため読み取りのみ） */
export const MERGE_OPEN = "⟦";
export const MERGE_CLOSE = "⟧";

/** contenteditable=false チップの前後に置き、キャレット位置を安定させる */
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
 * プレーンテキスト（⟦chip⟧ + 改行）→ エディタ HTML。
 * 改行は必ず <br> に変換する（テキスト中の実改行とブロック境界の二重化を防ぐ）。
 */
export function mergeTextToHtml(text: string): string {
  const normalized = normalizeMergeText(text);
  if (!normalized) return "";

  const parts = normalized.split(/(⟦[^⟧]+⟧)/g);
  return parts
    .map((part) => {
      const m = part.match(/^⟦([^⟧]+)⟧$/);
      if (m) return chipHtml(m[1] ?? "");
      return escapeHtml(part).replace(/\r\n?|\n/g, "<br>");
    })
    .join("");
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

function isMergeChip(node: Node | null): node is HTMLElement {
  return (
    !!node &&
    isElementNode(node) &&
    node.classList.contains("mail-merge-chip")
  );
}

function isAnchorOnlyText(node: Node | null): node is Text {
  if (!node || !isTextNode(node)) return false;
  const t = node.textContent ?? "";
  return t.length > 0 && /^[\u200B]+$/.test(t);
}

function stripAnchors(text: string): string {
  return text.replace(/\u200B/g, "");
}

function isEmptyBlock(el: HTMLElement): boolean {
  const kids = Array.from(el.childNodes).filter((n) => {
    if (isTextNode(n)) return stripAnchors(n.textContent ?? "").length > 0;
    return true;
  });
  if (kids.length === 0) return true;
  return kids.length === 1 && isBrNode(kids[0]!);
}

function plainTextFromDomText(
  text: string,
  options: { collapseNewlines: boolean }
): string {
  const stripped = stripAnchors(text).replace(/\r\n?/g, "\n");
  // ブロック行モデルではテキスト内の \n は無視（行区切りは div/br が担う）
  return options.collapseNewlines ? stripped.replace(/\n/g, "") : stripped;
}

/** インラインノード列を文字列化（チップ・テキスト・soft <br>） */
function serializeInlineNodes(
  nodes: Node[],
  options: { stripTrailingPaddingBr: boolean; collapseTextNewlines: boolean }
): string {
  let list = nodes;
  if (
    options.stripTrailingPaddingBr &&
    list.length >= 2 &&
    isBrNode(list[list.length - 1]!)
  ) {
    const without = list.slice(0, -1);
    const hasVisible = without.some((n) => {
      if (isBrNode(n) || isMergeChip(n)) return true;
      if (isTextNode(n)) {
        return (
          plainTextFromDomText(n.textContent ?? "", {
            collapseNewlines: options.collapseTextNewlines,
          }).length > 0
        );
      }
      return isElementNode(n);
    });
    if (hasVisible) list = without;
  }

  let out = "";
  for (const node of list) {
    if (isTextNode(node)) {
      out += plainTextFromDomText(node.textContent ?? "", {
        collapseNewlines: options.collapseTextNewlines,
      });
      continue;
    }
    if (!isElementNode(node)) continue;

    const mergeKey = node.getAttribute("data-merge");
    if (mergeKey != null && node.classList.contains("mail-merge-chip")) {
      out += encodeMergeField(mergeKey);
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
      out += serializeInlineNodes(Array.from(node.childNodes), {
        stripTrailingPaddingBr: true,
        collapseTextNewlines: true,
      });
      continue;
    }
    out += serializeInlineNodes(Array.from(node.childNodes), {
      stripTrailingPaddingBr: false,
      collapseTextNewlines: options.collapseTextNewlines,
    });
  }
  return out;
}

/**
 * contenteditable DOM → プレーンテキスト。
 * - チップは ⟦key⟧
 * - <br> / ブロック境界は \n
 * - ZWSP アンカーは除去
 * - 末尾の意図した改行は保持（最終行 Enter が消えない）
 */
export function serializeMergeEditor(root: HTMLElement): string {
  const top = Array.from(root.childNodes).filter((node) => {
    if (!isTextNode(node)) return true;
    const raw = node.textContent ?? "";
    if (/^[\u200B]+$/.test(raw)) return true;
    // ブロック間のスペースだけのノードは無視（改行文字を含むものは残す）
    if (/^[ \t\r\f\v]+$/.test(raw)) return false;
    return true;
  });

  const usesBlocks = top.some(isBlockNode);
  let out = "";

  if (!usesBlocks) {
    // フラット構造: <br> とテキスト内 \n の両方を改行として読む（貼付け対策）
    out = serializeInlineNodes(top, {
      stripTrailingPaddingBr: false,
      collapseTextNewlines: false,
    });
  } else {
    const lines: string[] = [];
    for (const child of top) {
      if (isElementNode(child) && isBlockNode(child)) {
        if (isEmptyBlock(child)) {
          lines.push("");
          continue;
        }
        // ブロック内のテキスト \n は落とす（Chrome が行分割したあと残ると二重になる）
        const piece = serializeInlineNodes(Array.from(child.childNodes), {
          stripTrailingPaddingBr: true,
          collapseTextNewlines: true,
        });
        const parts = piece.split("\n");
        lines.push(...parts);
        continue;
      }
      if (isBrNode(child)) {
        // トップレベル <br> は行区切り
        if (lines.length === 0) lines.push("");
        lines.push("");
        continue;
      }
      if (isTextNode(child) || isElementNode(child)) {
        const piece = serializeInlineNodes([child], {
          stripTrailingPaddingBr: false,
          collapseTextNewlines: true,
        });
        if (lines.length === 0) {
          lines.push(...piece.split("\n"));
        } else {
          const parts = piece.split("\n");
          lines[lines.length - 1] =
            (lines[lines.length - 1] ?? "") + (parts[0] ?? "");
          lines.push(...parts.slice(1));
        }
      }
    }
    out = lines.join("\n");
  }

  // チップも文字もない（改行だけの空エディタ）は空文字
  if (!/⟦/.test(out) && out.replace(/\n/g, "").length === 0) {
    return "";
  }

  return out;
}

function siblingInDirection(
  node: Node,
  direction: "backward" | "forward"
): Node | null {
  return direction === "backward" ? node.previousSibling : node.nextSibling;
}

/** キャレット位置から見て隣接するチップ（ZWSP アンカー越し）を探す */
export function findAdjacentMergeChip(
  root: HTMLElement,
  range: Range,
  direction: "backward" | "forward"
): HTMLElement | null {
  const { startContainer, startOffset } = range;

  const skipAnchors = (start: Node | null): Node | null => {
    let n = start;
    while (n && root.contains(n) && isAnchorOnlyText(n)) {
      n = siblingInDirection(n, direction);
    }
    return n;
  };

  if (startContainer === root) {
    const idx = direction === "backward" ? startOffset - 1 : startOffset;
    const node = root.childNodes[idx] ?? null;
    if (isMergeChip(node)) return node;
    const found = skipAnchors(node);
    return isMergeChip(found) ? found : null;
  }

  if (isTextNode(startContainer)) {
    const text = startContainer;
    const value = text.textContent ?? "";
    if (direction === "backward") {
      if (startOffset > 0) {
        // 同一テキスト内の通常文字があればチップ隣接ではない
        const before = value.slice(0, startOffset);
        if (stripAnchors(before).length > 0) return null;
      }
      const found = skipAnchors(text.previousSibling);
      return isMergeChip(found) ? found : null;
    }
    if (startOffset < value.length) {
      const after = value.slice(startOffset);
      if (stripAnchors(after).length > 0) return null;
    }
    const found = skipAnchors(text.nextSibling);
    return isMergeChip(found) ? found : null;
  }

  if (isElementNode(startContainer)) {
    const el = startContainer;
    if (direction === "backward") {
      if (startOffset === 0) {
        const found = skipAnchors(el.previousSibling);
        return isMergeChip(found) ? found : null;
      }
      const child = el.childNodes[startOffset - 1] ?? null;
      const found = skipAnchors(child);
      return isMergeChip(found) ? found : null;
    }
    const child = el.childNodes[startOffset] ?? null;
    const found = skipAnchors(child);
    return isMergeChip(found) ? found : null;
  }

  return null;
}

function removeChipAnchors(chip: HTMLElement) {
  const prev = chip.previousSibling;
  const next = chip.nextSibling;
  if (isAnchorOnlyText(prev)) prev.remove();
  if (isAnchorOnlyText(next)) next.remove();
}

/** Backspace/Delete で非編集チップを除去（ZWSP アンカー越し・スマホ対応） */
export function removeAdjacentMergeChip(
  root: HTMLElement,
  range: Range,
  direction: "backward" | "forward"
): boolean {
  const chip = findAdjacentMergeChip(root, range, direction);
  if (!chip || !root.contains(chip)) return false;

  const sel = window.getSelection();
  removeChipAnchors(chip);

  const restore =
    direction === "backward"
      ? chip.previousSibling
      : chip.nextSibling;
  chip.remove();

  if (sel) {
    const r = document.createRange();
    if (restore && isTextNode(restore)) {
      const pos =
        direction === "backward" ? (restore.textContent?.length ?? 0) : 0;
      r.setStart(restore, pos);
    } else if (restore) {
      if (direction === "backward") r.setStartAfter(restore);
      else r.setStartBefore(restore);
    } else {
      r.selectNodeContents(root);
      r.collapse(direction !== "backward");
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

function createChipElement(doc: Document, key: string): HTMLElement {
  const chip = doc.createElement("span");
  chip.className = "mail-merge-chip";
  chip.setAttribute("data-merge", key);
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("draggable", "true");
  chip.textContent = key;
  return chip;
}

export function insertMergeChip(
  root: HTMLElement,
  key: string,
  range?: Range | null
) {
  const doc = root.ownerDocument;
  const chip = createChipElement(doc, key);
  const before = doc.createTextNode(CARET_ANCHOR);
  const after = doc.createTextNode(CARET_ANCHOR);

  const sel = window.getSelection();
  let targetRange = range ?? null;

  if (!targetRange && sel && sel.rangeCount > 0) {
    targetRange = sel.getRangeAt(0);
  }

  if (!targetRange || !root.contains(targetRange.commonAncestorContainer)) {
    root.appendChild(before);
    root.appendChild(chip);
    root.appendChild(after);
    if (sel) {
      const r = doc.createRange();
      r.setStartAfter(after);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return;
  }

  targetRange.deleteContents();

  // 挿入位置がテキストノード内なら分割してフラットに並べる
  const frag = doc.createDocumentFragment();
  frag.appendChild(before);
  frag.appendChild(chip);
  frag.appendChild(after);
  targetRange.insertNode(frag);

  if (sel) {
    const r = doc.createRange();
    r.setStartAfter(after);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

/**
 * Enter 用: キャレット位置に <br> を挿入。
 * テキストノードに実改行を入れると、Chrome の div 行分割と二重化する。
 */
export function insertNewlineAtSelection(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;

  range.deleteContents();
  const br = root.ownerDocument.createElement("br");
  range.insertNode(br);

  const next = root.ownerDocument.createRange();
  next.setStartAfter(br);
  next.collapse(true);
  sel.removeAllRanges();
  sel.addRange(next);
  return true;
}

/** プレーンテキスト貼付け（改行は <br>、HTML は持たない） */
export function insertPlainTextAtSelection(
  root: HTMLElement,
  text: string
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;

  range.deleteContents();
  const doc = root.ownerDocument;
  const frag = doc.createDocumentFragment();
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  const parts = normalized.split("\n");
  parts.forEach((part, index) => {
    if (part) frag.appendChild(doc.createTextNode(part));
    if (index < parts.length - 1) frag.appendChild(doc.createElement("br"));
  });

  const last = frag.lastChild;
  range.insertNode(frag);
  const next = doc.createRange();
  if (last) next.setStartAfter(last);
  else next.setStart(range.startContainer, range.startOffset);
  next.collapse(true);
  sel.removeAllRanges();
  sel.addRange(next);
  return true;
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
