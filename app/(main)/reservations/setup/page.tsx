import { Suspense } from "react";
import { ConnectionError } from "@/components/SetupRequired";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { ReservationSetupBoard } from "@/components/setup/ReservationSetupBoard";
import { getReservations } from "@/lib/queries/reservations";
import { getRooms } from "@/lib/queries/rooms";
import { parseListScope } from "@/lib/utils/list-scope";

type PageProps = {
  searchParams: Promise<{
    period?: string;
    status?: string;
    scope?: string;
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

  const [{ reservations, error }, { rooms, error: roomsError }] =
    await Promise.all([
      getReservations({
        period,
        status: params.status,
        scope,
      }),
      getRooms(),
    ]);

  if (error || roomsError) {
    return <ConnectionError message={error || roomsError || ""} />;
  }

  return (
    <div className="setup-page-chrome">
      <div className="setup-page-chrome-top">
        <Suspense fallback={null}>
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
        </Suspense>
      </div>
      <Suspense fallback={<div className="inline-loading">読み込み中…</div>}>
        <ReservationSetupBoard
          reservations={reservations}
          rooms={rooms.map((r) => ({
            room_id: r.room_id,
            room_name: r.room_name,
          }))}
        />
      </Suspense>
    </div>
  );
}
