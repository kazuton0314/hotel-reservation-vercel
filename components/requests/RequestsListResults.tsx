"use client";

import { useSearchParams } from "next/navigation";
import { ListPagination } from "@/components/list/ListPagination";
import { useListSearch } from "@/components/list/ListSearchProvider";
import { RequestListRow } from "@/components/requests/RequestListRow";
import type { RequestListItem } from "@/lib/queries/requests";
import {
  DEFAULT_LIST_PAGE_SIZE,
  parsePageParam,
} from "@/lib/utils/list-pagination";
import { listScopeLabel, type ListScope } from "@/lib/utils/list-scope";
import { listSortDirLabel, parseListSort } from "@/lib/utils/list-sort";
import { searchParamsToRecord } from "@/lib/utils/search-params";

type Props = {
  requests: RequestListItem[];
  scope: ListScope;
  total: number;
};

export function RequestsListResults({ requests, scope, total }: Props) {
  const searchParams = useSearchParams();
  const { keyword } = useListSearch();
  const q = keyword.trim() || undefined;
  const filterField = searchParams.get("filterField") ?? undefined;
  const filterValue = searchParams.get("filterValue") ?? undefined;
  const sort =
    searchParams.get("sort") || searchParams.get("dir")
      ? parseListSort(searchParams.get("sort"), searchParams.get("dir"))
      : ({ field: "received", dir: "desc" } as const);
  const page = parsePageParam(searchParams.get("page") ?? undefined);
  const scopeLabel = listScopeLabel(scope);
  const paramsRecord = searchParamsToRecord(searchParams);
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIST_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <>
      <p className="list-sort-summary">
        {total}件（{scopeLabel}） / {listSortDirLabel(sort)}
        {q?.trim() ? ` / 検索「${q.trim()}」` : ""}
        {filterField && filterValue ? ` / 絞込` : ""}
      </p>
      {total ? (
        <>
          {requests.map((item) => (
            <RequestListRow key={item.request_id} item={item} />
          ))}
          <ListPagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            pageSize={DEFAULT_LIST_PAGE_SIZE}
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
