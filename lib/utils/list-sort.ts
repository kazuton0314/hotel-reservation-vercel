export type ListSortField = "stay" | "received" | "updated";
export type ListSortDir = "asc" | "desc";

export type ListSort = {
  field: ListSortField;
  dir: ListSortDir;
};

export function parseListSort(
  field?: string | null,
  dir?: string | null
): ListSort {
  const f: ListSortField =
    field === "received" || field === "updated" ? field : "stay";
  // dir 未指定時はフィールドごとのデフォルト
  const d: ListSortDir =
    dir === "asc" || dir === "desc" ? dir : defaultDirForSortField(f);
  return { field: f, dir: d };
}

/** 滞在日=早い順 / 受付・更新=新しい（直近）順 */
export function defaultDirForSortField(field: ListSortField): ListSortDir {
  return field === "stay" ? "asc" : "desc";
}

export function listSortDirLabel(sort: ListSort): string {
  if (sort.field === "stay") {
    return sort.dir === "asc" ? "チェックインが早い順" : "チェックインが遅い順";
  }
  if (sort.field === "received") {
    return sort.dir === "asc" ? "受付が古い順" : "受付が新しい順";
  }
  return sort.dir === "asc" ? "更新が古い順" : "更新が新しい順";
}

/**
 * 一覧の上→下の時系列イメージに合わせる:
 * 早い／古い順 = ↓（上から下へ進む）、遅い／新しい順 = ↑
 */
export function listSortDirIcon(sort: ListSort): string {
  return sort.dir === "asc" ? "↓" : "↑";
}

type SortableListItem = {
  check_in?: string | null;
  check_out?: string | null;
  received_ms?: number;
  updated_ms?: number;
  representative_name?: string | null;
};

function compareName(a: SortableListItem, b: SortableListItem): number {
  return String(a.representative_name || "").localeCompare(
    String(b.representative_name || ""),
    "ja"
  );
}

function compareDateKey(
  a: string | null | undefined,
  b: string | null | undefined,
  dir: ListSortDir
): number {
  const av = a || "";
  const bv = b || "";
  if (av === bv) return 0;
  const mul = dir === "asc" ? 1 : -1;
  return av < bv ? -1 * mul : 1 * mul;
}

export function sortListItems<T extends SortableListItem>(
  items: T[],
  sort: ListSort
): T[] {
  const mul = sort.dir === "asc" ? 1 : -1;
  return items.slice().sort((a, b) => {
    let cmp = 0;
    if (sort.field === "stay") {
      cmp = compareDateKey(a.check_in, b.check_in, sort.dir);
    } else if (sort.field === "received") {
      const av = a.received_ms ?? 0;
      const bv = b.received_ms ?? 0;
      cmp = av === bv ? 0 : av < bv ? -1 : 1;
      cmp *= mul;
    } else {
      const av = a.updated_ms ?? 0;
      const bv = b.updated_ms ?? 0;
      cmp = av === bv ? 0 : av < bv ? -1 : 1;
      cmp *= mul;
    }
    if (cmp !== 0) return cmp;
    return compareName(a, b);
  });
}
