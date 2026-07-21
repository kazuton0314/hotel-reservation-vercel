"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ListPagination } from "@/components/list/ListPagination";
import { useListSearch } from "@/components/list/ListSearchProvider";
import { RequestListRow } from "@/components/requests/RequestListRow";
import type { RequestListItem } from "@/lib/queries/requests";
import { applyRequestListFilter } from "@/lib/services/request-list-filter";
import {
  DEFAULT_LIST_PAGE_SIZE,
  paginateItems,
  parsePageParam,
} from "@/lib/utils/list-pagination";
import { filterListBySearch } from "@/lib/utils/list-search";
import { listScopeLabel, type ListScope } from "@/lib/utils/list-scope";
import {
  listSortDirLabel,
  parseListSort,
  sortListItems,
} from "@/lib/utils/list-sort";
import { searchParamsToRecord } from "@/lib/utils/search-params";

type Props = {
  requests: RequestListItem[];
  scope: ListScope;
};

export function RequestsListResults({ requests, scope }: Props) {
  const searchParams = useSearchParams();
  const { keyword, checkIn } = useListSearch();
  const q = keyword.trim() || undefined;
  const checkInFilter = checkIn.trim() || undefined;
  const filterField = searchParams.get("filterField") ?? undefined;
  const filterValue = searchParams.get("filterValue") ?? undefined;
  const sort =
    searchParams.get("sort") || searchParams.get("dir")
      ? parseListSort(searchParams.get("sort"), searchParams.get("dir"))
      : ({ field: "received", dir: "desc" } as const);
  const page = parsePageParam(searchParams.get("page") ?? undefined);
  const scopeLabel = listScopeLabel(scope);
  const paramsRecord = searchParamsToRecord(searchParams);

  const sorted = useMemo(() => {
    const filtered = applyRequestListFilter(requests, filterField, filterValue);
    const searched = filterListBySearch(
      filtered.map((item) => ({ ...item, id: item.request_id })),
      q,
      checkInFilter
    );
    return sortListItems(searched, sort);
  }, [requests, filterField, filterValue, q, checkInFilter, sort]);

  const paged = useMemo(
    () => paginateItems(sorted, page, DEFAULT_LIST_PAGE_SIZE),
    [sorted, page]
  );

  return (
    <>
      <p className="list-sort-summary">
        {sorted.length}件（{scopeLabel}） / {listSortDirLabel(sort)}
        {q?.trim() ? ` / 検索「${q.trim()}」` : ""}
        {filterField && filterValue ? ` / 絞込` : ""}
      </p>
      {sorted.length ? (
        <>
          {paged.items.map((item) => (
            <RequestListRow key={item.request_id} item={item} />
          ))}
          <ListPagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            basePath="/requests"
            searchParams={paramsRecord}
          />
        </>
      ) : (
        <div className="empty">該当するリクエストはありません</div>
      )}
    </>
  );
}
