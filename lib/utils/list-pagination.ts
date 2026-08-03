export const DEFAULT_LIST_PAGE_SIZE = 10;

/** セットアップ表は件数多めでも編集しやすいよう広めに取る */
export const SETUP_BOARD_PAGE_SIZE = 80;

export function parsePageParam(raw?: string): number {
  const n = parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize = DEFAULT_LIST_PAGE_SIZE
) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}
