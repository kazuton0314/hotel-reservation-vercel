import { Suspense } from "react";
import { ConnectionError } from "@/components/SetupRequired";
import { ListPagination } from "@/components/list/ListPagination";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ListSearchProvider } from "@/components/list/ListSearchProvider";
import { ReservationListFilterBar } from "@/components/list/ReservationListFilterBar";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { ReservationSetupBoard } from "@/components/setup/ReservationSetupBoard";
import { SetupPageShell } from "@/components/setup/SetupPageShell";
import { buildReservationListFilterFields } from "@/lib/list/reservation-filter-fields";
import { getReservations } from "@/lib/queries/reservations";
import { getRooms } from "@/lib/queries/rooms";
import {
  parsePageParam,
  SETUP_BOARD_PAGE_SIZE,
} from "@/lib/utils/list-pagination";
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
    q?: string;
    checkIn?: string;
    page?: string;
  }>;
};

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

export default async function ReservationsSetupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = parseListScope(params.scope);
  const period = resolvePeriod(params);

  return (
    <ListSearchProvider>
      <SetupPageShell
        top={
          <>
            <ListScopeBar kind="reservation" scope={scope} />
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
          </>
        }
      >
        <Suspense
          fallback={<div className="inline-loading">セットアップ表を読み込み中…</div>}
        >
          <ReservationsSetupBody params={params} period={period} scope={scope} />
        </Suspense>
      </SetupPageShell>
    </ListSearchProvider>
  );
}

async function ReservationsSetupBody({
  params,
  period,
  scope,
}: {
  params: {
    period?: string;
    status?: string;
    scope?: string;
    filterField?: string;
    filterValue?: string;
    sort?: string;
    dir?: string;
    q?: string;
    checkIn?: string;
    page?: string;
  };
  period: "provisional" | "confirmed" | "cancelled";
  scope: ReturnType<typeof parseListScope>;
}) {
  const page = parsePageParam(params.page);
  const [{ reservations, total, error }, { rooms, error: roomsError }] =
    await Promise.all([
      getReservations({
        period,
        status: params.status,
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
      }),
      getRooms(),
    ]);

  if (error || roomsError) {
    return <ConnectionError message={error || roomsError || ""} />;
  }

  const filterFields = buildReservationListFilterFields(rooms);
  const totalPages = Math.max(1, Math.ceil(total / SETUP_BOARD_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <>
      <ReservationListFilterBar
        fields={filterFields}
        activeField={params.filterField}
        activeValue={params.filterValue}
      />
      <ReservationSetupBoard
        reservations={reservations}
        rooms={rooms.map((r) => ({
          room_id: r.room_id,
          room_name: r.room_name,
        }))}
      />
      <ListPagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        pageSize={SETUP_BOARD_PAGE_SIZE}
        basePath="/reservations/setup"
        searchParams={{
          period: params.period,
          status: params.status,
          scope: params.scope,
          filterField: params.filterField,
          filterValue: params.filterValue,
          sort: params.sort,
          dir: params.dir,
          q: params.q,
          checkIn: params.checkIn,
        }}
      />
    </>
  );
}
