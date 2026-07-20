import { Suspense } from "react";
import { ConnectionError } from "@/components/SetupRequired";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ListSearchProvider } from "@/components/list/ListSearchProvider";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { RequestListFilterBar } from "@/components/list/RequestListFilterBar";
import { RequestSetupBoard } from "@/components/setup/RequestSetupBoard";
import { SetupPageShell } from "@/components/setup/SetupPageShell";
import { getRequests } from "@/lib/queries/requests";
import { parseListScope } from "@/lib/utils/list-scope";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    scope?: string;
    sort?: string;
    dir?: string;
    q?: string;
    checkIn?: string;
  }>;
};

export default async function RequestsSetupPage({ searchParams }: PageProps) {
  const params = await searchParams;
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
    <Suspense fallback={<div className="inline-loading">読み込み中…</div>}>
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
              <RequestListFilterBar />
            </>
          }
        >
          <RequestSetupBoard requests={requests} />
        </SetupPageShell>
      </ListSearchProvider>
    </Suspense>
  );
}
