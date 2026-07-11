"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ListPagination } from "@/components/list/ListPagination";
import { useListSearch } from "@/components/list/ListSearchProvider";
import { ReservationListRow } from "@/components/reservations/ReservationListRow";
import type { ReservationListItem } from "@/lib/queries/reservations";
import { applyReservationListFilter } from "@/lib/services/reservation-list-filter";
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
  reservations: ReservationListItem[];
  scope: ListScope;
};

export function ReservationsListResults({ reservations, scope }: Props) {
  const searchParams = useSearchParams();
  const { keyword, checkIn } = useListSearch();
  const q = keyword.trim() || undefined;
  const checkInFilter = checkIn.trim() || undefined;
  const filterField = searchParams.get("filterField") ?? undefined;
  const filterValue = searchParams.get("filterValue") ?? undefined;
  const sort = parseListSort(
    searchParams.get("sort"),
    searchParams.get("dir")
  );
  const page = parsePageParam(searchParams.get("page") ?? undefined);
  const scopeLabel = listScopeLabel(scope);
  const paramsRecord = searchParamsToRecord(searchParams);

  const sorted = useMemo(() => {
    const filtered = applyReservationListFilter(
      reservations,
      filterField,
      filterValue
    );
    const searched = filterListBySearch(
      filtered.map((item) => ({ ...item, id: item.reservation_id })),
      q,
      checkInFilter
    );
    return sortListItems(searched, sort);
  }, [reservations, filterField, filterValue, q, checkInFilter, sort]);

  const paged = useMemo(
    () => paginateItems(sorted, page, DEFAULT_LIST_PAGE_SIZE),
    [sorted, page]
  );

  return (
    <>
      <p className="list-sort-summary">
        {sorted.length}件（{scopeLabel}） / {listSortDirLabel(sort)}
        {q?.trim() ? ` / 検索「${q.trim()}」` : ""}
      </p>
      {sorted.length ? (
        <>
          {paged.items.map((item) => (
            <ReservationListRow key={item.reservation_id} item={item} />
          ))}
          <ListPagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            basePath="/reservations"
            searchParams={paramsRecord}
          />
        </>
      ) : (
        <div className="empty">該当する予約はありません</div>
      )}
    </>
  );
}
