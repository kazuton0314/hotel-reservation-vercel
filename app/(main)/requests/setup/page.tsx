import { Suspense } from "react";
import { ConnectionError } from "@/components/SetupRequired";
import { ListPagination } from "@/components/list/ListPagination";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ListSearchProvider } from "@/components/list/ListSearchProvider";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { RequestListFilterBar } from "@/components/list/RequestListFilterBar";
import { RequestSetupBoard } from "@/components/setup/RequestSetupBoard";
import { SetupPageShell } from "@/components/setup/SetupPageShell";
import { buildRequestListFilterFields } from "@/lib/list/request-filter-fields";
import { getRequests } from "@/lib/queries/requests";
import {
  parsePageParam,
  SETUP_BOARD_PAGE_SIZE,
} from "@/lib/utils/list-pagination";
import { parseListScope } from "@/lib/utils/list-scope";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    scope?: string;
    sort?: string;
    dir?: string;
    q?: string;
    checkIn?: string;
    filterField?: string;
    filterValue?: string;
    page?: string;
  }>;
};

export default async function RequestsSetupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = parseListScope(params.scope);
  const status = params.status || "リクエスト";
  const filterFields = buildRequestListFilterFields();

  return (
    <ListSearchProvider>
      <SetupPageShell
        top={
          <>
            <ListScopeBar kind="request" scope={scope} />
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
          </>
        }
      >
        <Suspense
          fallback={<div className="inline-loading">セットアップ表を読み込み中…</div>}
        >
          <RequestsSetupBody params={params} status={status} scope={scope} />
        </Suspense>
      </SetupPageShell>
    </ListSearchProvider>
  );
}

async function RequestsSetupBody({
  params,
  status,
  scope,
}: {
  params: {
    status?: string;
    scope?: string;
    sort?: string;
    dir?: string;
    q?: string;
    checkIn?: string;
    filterField?: string;
    filterValue?: string;
    page?: string;
  };
  status: string;
  scope: ReturnType<typeof parseListScope>;
}) {
  const page = parsePageParam(params.page);
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
      page,
      pageSize: SETUP_BOARD_PAGE_SIZE,
    },
  });

  if (error) {
    return <ConnectionError message={error} />;
  }

  const totalPages = Math.max(1, Math.ceil(total / SETUP_BOARD_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <>
      <RequestSetupBoard requests={requests} />
      <div className="setup-page-chrome-top">
        <ListPagination
          page={safePage}
          totalPages={totalPages}
          total={total}
          pageSize={SETUP_BOARD_PAGE_SIZE}
          basePath="/requests/setup"
          searchParams={{
            status: params.status,
            scope: params.scope,
            sort: params.sort,
            dir: params.dir,
            q: params.q,
            checkIn: params.checkIn,
            filterField: params.filterField,
            filterValue: params.filterValue,
          }}
        />
      </div>
    </>
  );
}
