import { Suspense } from "react";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ListSearchProvider } from "@/components/list/ListSearchProvider";
import { ConnectionError } from "@/components/SetupRequired";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { parseListScope } from "@/lib/utils/list-scope";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { RequestListFilterBar } from "@/components/list/RequestListFilterBar";
import { RequestsListResults } from "@/components/requests/RequestsListResults";
import { getRequests } from "@/lib/queries/requests";

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
  };
}) {
  const scope = parseListScope(params.scope);
  const status = params.status || "リクエスト";

  const { requests, error } = await getRequests({
    status,
    scope,
  });

  if (error) {
    return <ConnectionError message={error} />;
  }

  return (
    <>
      <ListScopeBar kind="request" scope={scope} />
      <Suspense fallback={null}>
        <ListSearchProvider>
          <ListSearchBar />
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
          <Suspense
            fallback={<div className="inline-loading">一覧を読み込み中…</div>}
          >
            <RequestsListResults requests={requests} scope={scope} />
          </Suspense>
        </ListSearchProvider>
      </Suspense>
    </>
  );
}
