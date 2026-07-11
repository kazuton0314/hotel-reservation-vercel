import { Suspense } from "react";
import { ListPagination } from "@/components/list/ListPagination";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ConnectionError } from "@/components/SetupRequired";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { listScopeLabel, parseListScope } from "@/lib/utils/list-scope";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { RequestListFilterBar } from "@/components/list/RequestListFilterBar";
import { RequestListRow } from "@/components/requests/RequestListRow";
import { getRequests } from "@/lib/queries/requests";
import {
  listSortDirLabel,
  parseListSort,
  sortListItems,
} from "@/lib/utils/list-sort";
import {
  DEFAULT_LIST_PAGE_SIZE,
  paginateItems,
  parsePageParam,
} from "@/lib/utils/list-pagination";
import { filterListBySearch } from "@/lib/utils/list-search";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    scope?: string;
    sort?: string;
    dir?: string;
    page?: string;
    q?: string;
    checkIn?: string;
  }>;
};

export default async function RequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <RequestsContent params={params} />;
}

async function RequestsContent({
  params,
}: {
  params: {
    status?: string;
    scope?: string;
    sort?: string;
    dir?: string;
    page?: string;
    q?: string;
    checkIn?: string;
  };
}) {
  const scope = parseListScope(params.scope);
  const status = params.status || "リクエスト";
  const sort =
    params.sort || params.dir
      ? parseListSort(params.sort, params.dir)
      : ({ field: "received", dir: "desc" } as const);
  const page = parsePageParam(params.page);

  const { requests, error } = await getRequests({
    status,
    scope,
  });

  if (error) {
    return <ConnectionError message={error} />;
  }

  const searched = filterListBySearch(
    requests.map((item) => ({ ...item, id: item.request_id })),
    params.q,
    params.checkIn
  );
  const sorted = sortListItems(searched, sort);
  const paged = paginateItems(sorted, page, DEFAULT_LIST_PAGE_SIZE);
  const scopeLabel = listScopeLabel(scope);

  return (
    <>
      <ListScopeBar kind="request" scope={scope} />
      <Suspense fallback={null}>
        <ListSearchBar />
      </Suspense>
      <ListStatusTabs
        className="tabs tabs-3 request-filter-tabs"
        activeId={status}
        tabs={[
          {
            id: "リクエスト",
            label: "リクエスト",
            paramKey: "status",
            paramValue: "リクエスト",
            emphasis: "primary",
          },
          {
            id: "承認済",
            label: "承認済",
            paramKey: "status",
            paramValue: "承認済",
          },
          {
            id: "却下",
            label: "却下",
            paramKey: "status",
            paramValue: "却下",
          },
        ]}
      />
      <RequestListFilterBar />
      <p className="list-sort-summary">
        {sorted.length}件（{scopeLabel}） / {listSortDirLabel(sort)}
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
            searchParams={params}
          />
        </>
      ) : (
        <div className="empty">該当するリクエストはありません</div>
      )}
    </>
  );
}
