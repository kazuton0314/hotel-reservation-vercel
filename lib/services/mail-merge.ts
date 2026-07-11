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
        return `<span class="mail-merge-chip" data-merge="${escapeHtml(key)}" contenteditable="false">${escapeHtml(key)}</span>`;
      }
      return escapeHtml(part).replace(/\n/g, "<br>");
    })
    .join("");
}

export function serializeMergeEditor(root: HTMLElement): string {
  let out = "";

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const mergeKey = el.getAttribute("data-merge");
    if (mergeKey) {
      out += encodeMergeField(mergeKey);
      return;
    }

    if (el.tagName === "BR") {
      out += "\n";
      return;
    }

    if (el.tagName === "DIV" || el.tagName === "P") {
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
      el.childNodes.forEach(walk);
      return;
    }

    el.childNodes.forEach(walk);
  }

  root.childNodes.forEach(walk);
  return out.replace(/\n$/, "");
}

export function insertMergeChip(root: HTMLElement, key: string) {
  const chip = document.createElement("span");
  chip.className = "mail-merge-chip";
  chip.setAttribute("data-merge", key);
  chip.setAttribute("contenteditable", "false");
  chip.textContent = key;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    root.appendChild(chip);
    return;
  }

  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) {
    root.appendChild(chip);
    return;
  }

  range.deleteContents();
  range.insertNode(chip);
  range.setStartAfter(chip);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
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
