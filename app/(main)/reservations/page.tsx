import { Suspense } from "react";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ListSearchProvider } from "@/components/list/ListSearchProvider";
import { ReservationListFilterBar } from "@/components/list/ReservationListFilterBar";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { ReservationsListManualAdd } from "@/components/reservations/ReservationsListManualAdd";
import { ReservationsListResults } from "@/components/reservations/ReservationsListResults";
import { ConnectionError } from "@/components/SetupRequired";
import { getReservations } from "@/lib/queries/reservations";
import { getRooms } from "@/lib/queries/rooms";
import { buildReservationListFilterFields } from "@/lib/list/reservation-filter-fields";
import { parseListScope } from "@/lib/utils/list-scope";

type PageProps = {
  searchParams: Promise<{
    period?: string;
    status?: string;
    scope?: string;
    filterField?: string;
    filterValue?: string;
    sort?: string;
    dir?: string;
    page?: string;
    q?: string;
    checkIn?: string;
  }>;
};

export default async function ReservationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <ReservationsContent params={params} />;
}

function resolvePeriod(params: {
  period?: string;
  status?: string;
}): "provisional" | "confirmed" | "cancelled" {
  if (params.period === "provisional" || params.period === "cancelled") {
    return params.period;
  }
  if (params.status === "仮予約") return "provisional";
  if (params.status === "キャンセル") return "cancelled";
  return "confirmed";
}

async function ReservationsContent({
  params,
}: {
  params: {
    period?: string;
    status?: string;
    scope?: string;
    filterField?: string;
    filterValue?: string;
  };
}) {
  const scope = parseListScope(params.scope);
  const period = resolvePeriod(params);

  const [{ reservations, error }, { rooms }] = await Promise.all([
    getReservations({
      period,
      status: params.status,
      scope,
    }),
    getRooms(),
  ]);

  if (error) {
    return <ConnectionError message={error} />;
  }

  const filterFields = buildReservationListFilterFields(rooms);

  return (
    <>
      <ReservationsListManualAdd />
      <ListScopeBar kind="reservation" scope={scope} />
      <Suspense fallback={null}>
        <ListSearchProvider>
          <ListStatusTabs
            className="tabs tabs-3 list-filter-tabs"
            activeId={period}
            tabs={[
              {
                id: "provisional",
                label: "仮予約",
                paramKey: "period",
                paramValue: "provisional",
              },
              {
                id: "confirmed",
                label: "確定",
                paramKey: "period",
                paramValue: "confirmed",
                emphasis: "primary",
              },
              {
                id: "cancelled",
                label: "キャンセル",
                paramKey: "period",
                paramValue: "cancelled",
              },
            ]}
          />
          <ListSearchBar />
          <ReservationListFilterBar
            fields={filterFields}
            activeField={params.filterField}
            activeValue={params.filterValue}
          />
          <Suspense
            fallback={<div className="inline-loading">一覧を読み込み中…</div>}
          >
            <ReservationsListResults reservations={reservations} scope={scope} />
          </Suspense>
        </ListSearchProvider>
      </Suspense>
    </>
  );
}
