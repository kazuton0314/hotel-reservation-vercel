export const DEFAULT_LIST_PAGE_SIZE = 10;

/** セットアップ表は件数多めでも編集しやすいよう広めに取る */
export const SETUP_BOARD_PAGE_SIZE = 80;

export function parsePageParam(raw?: string): number {
  const n = parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function totalPagesForCount(
  total: number,
  pageSize = DEFAULT_LIST_PAGE_SIZE
): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** 総件数に収まるページ番号へ丸める（0件でも 1） */
export function clampPage(
  page: number,
  total: number,
  pageSize = DEFAULT_LIST_PAGE_SIZE
): number {
  const safe = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  return Math.min(safe, totalPagesForCount(total, pageSize));
}

export function pageRange(
  page: number,
  pageSize = DEFAULT_LIST_PAGE_SIZE
): { from: number; to: number } {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

/** PostgREST が返す HTTP 416（ページが件数を超えたとき） */
export function isRangeNotSatisfiableError(
  error: { code?: string; message?: string; details?: string } | null | undefined
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "PGRST103" || code === "416") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("requested range not satisfiable");
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize = DEFAULT_LIST_PAGE_SIZE
) {
  const total = items.length;
  const totalPages = totalPagesForCount(total, pageSize);
  const safePage = clampPage(page, total, pageSize);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}
