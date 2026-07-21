"use client";

import { useSearchParams } from "next/navigation";
import { ListPagination } from "@/components/list/ListPagination";
import { useListSearch } from "@/components/list/ListSearchProvider";
import { ReservationListRow } from "@/components/reservations/ReservationListRow";
import type { ReservationListItem } from "@/lib/queries/reservations";
import {
  DEFAULT_LIST_PAGE_SIZE,
  parsePageParam,
} from "@/lib/utils/list-pagination";
import { listScopeLabel, type ListScope } from "@/lib/utils/list-scope";
import { listSortDirLabel, parseListSort } from "@/lib/utils/list-sort";
import { searchParamsToRecord } from "@/lib/utils/search-params";

type Props = {
  reservations: ReservationListItem[];
  scope: ListScope;
  /** サーバー側で絞込・検索・ページ済みのときの総件数 */
  total: number;
};

export function ReservationsListResults({
  reservations,
  scope,
  total,
}: Props) {
  const searchParams = useSearchParams();
  const { keyword } = useListSearch();
  const q = keyword.trim() || undefined;
  const sort = parseListSort(
    searchParams.get("sort"),
    searchParams.get("dir")
  );
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
      </p>
      {total ? (
        <>
          {reservations.map((item) => (
            <ReservationListRow key={item.reservation_id} item={item} />
          ))}
          <ListPagination
            page={safePage}
            totalPages={totalPages}
            total={total}
            pageSize={DEFAULT_LIST_PAGE_SIZE}
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
