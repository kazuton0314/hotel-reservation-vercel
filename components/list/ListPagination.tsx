import Link from "next/link";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  basePath: string;
  searchParams: Record<string, string | undefined>;
};

function buildHref(
  basePath: string,
  searchParams: Record<string, string | undefined>,
  targetPage: number
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page" || value == null || value === "") continue;
    params.set(key, value);
  }
  if (targetPage > 1) params.set("page", String(targetPage));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function ListPagination({
  page,
  totalPages,
  total,
  pageSize,
  basePath,
  searchParams,
}: Props) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <nav className="list-pagination" aria-label="ページ送り">
      <p className="list-pagination-summary">
        {start}–{end}件 / 全{total}件（{page}/{totalPages}ページ）
      </p>
      <div className="list-pagination-actions">
        {page > 1 ? (
          <Link
            href={buildHref(basePath, searchParams, page - 1)}
            className="btn btn-secondary btn-sm"
            prefetch
          >
            ← 前へ
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm" aria-disabled="true">
            ← 前へ
          </span>
        )}
        {page < totalPages ? (
          <Link
            href={buildHref(basePath, searchParams, page + 1)}
            className="btn btn-secondary btn-sm"
            prefetch
          >
            次へ →
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm" aria-disabled="true">
            次へ →
          </span>
        )}
      </div>
    </nav>
  );
}
