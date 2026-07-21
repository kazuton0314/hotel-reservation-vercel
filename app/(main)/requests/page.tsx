import { Suspense } from "react";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ListSearchProvider } from "@/components/list/ListSearchProvider";
import { ConnectionError } from "@/components/SetupRequired";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { parseListScope } from "@/lib/utils/list-scope";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { RequestListFilterBar } from "@/components/list/RequestListFilterBar";
import { RequestsListResults } from "@/components/requests/RequestsListResults";
import { ListSetupEntryLink } from "@/components/setup/ListSetupEntryLink";
import { buildRequestListFilterFields } from "@/lib/list/request-filter-fields";
import { getRequests } from "@/lib/queries/requests";
import { parsePageParam } from "@/lib/utils/list-pagination";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    scope?: string;
    sort?: string;
    dir?: string;
    page?: string;
    q?: string;
    checkIn?: string;
    filterField?: string;
    filterValue?: string;
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
    filterField?: string;
    filterValue?: string;
  };
}) {
  const scope = parseListScope(params.scope);
  const status = params.status || "リクエスト";
  const filterFields = buildRequestListFilterFields();

  const { requests, total, error } = await getRequests({
    status,
    scope,
    list: {
      q: params.q,
      checkIn: params.checkIn,
      filterField: params.filterField,
      filterValue: params.filterValue,
      sort: params.sort,
      dir: params.dir,
      page: parsePageParam(params.page),
    },
  });

  if (error) {
    return <ConnectionError message={error} />;
  }

  return (
    <>
      <div className="list-actions-row">
        <Suspense fallback={null}>
          <ListSetupEntryLink href="/requests/setup" />
        </Suspense>
      </div>
      <ListScopeBar kind="request" scope={scope} />
      <Suspense fallback={null}>
        <ListSearchProvider>
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
          <ListSearchBar />
          <RequestListFilterBar
            fields={filterFields}
            activeField={params.filterField}
            activeValue={params.filterValue}
          />
          <Suspense
            fallback={<div className="inline-loading">一覧を読み込み中…</div>}
          >
            <RequestsListResults
              requests={requests}
              scope={scope}
              total={total}
            />
          </Suspense>
        </ListSearchProvider>
      </Suspense>
    </>
  );
}
