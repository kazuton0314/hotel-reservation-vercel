import { Suspense } from "react";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import {
  ReservationListFilterBar,
  type ListFilterFieldDef,
} from "@/components/list/ReservationListFilterBar";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { ReservationsListManualAdd } from "@/components/reservations/ReservationsListManualAdd";
import { ReservationsListResults } from "@/components/reservations/ReservationsListResults";
import {
  LIST_FILTER_BBQ_OPTIONS,
  LIST_FILTER_CHANNEL_OPTIONS,
  LIST_FILTER_MEAL_OPTIONS,
  LIST_FILTER_PAYMENT_OPTIONS,
} from "@/lib/config/field-options";
import { ConnectionError } from "@/components/SetupRequired";
import { getReservations } from "@/lib/queries/reservations";
import { getRooms } from "@/lib/queries/rooms";
import { UNASSIGNED_ROOM_FILTER } from "@/lib/services/reservation-list-filter";
import { parseListScope } from "@/lib/utils/list-scope";

type PageProps = {
  searchParams: Promise<{
    period?: string;
    status?: string;
    scope?: string;
    assignment?: string;
    mail?: string;
    companion?: string;
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
    assignment?: string;
    mail?: string;
    companion?: string;
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
      assignment: params.assignment === "unassigned" ? "unassigned" : undefined,
      mailPending: params.mail === "pending",
      companionPending: params.companion === "pending",
    }),
    getRooms(),
  ]);

  if (error) {
    return <ConnectionError message={error} />;
  }

  const filterFields: ListFilterFieldDef[] = [
    {
      key: "channel",
      label: "予約経路",
      options: LIST_FILTER_CHANNEL_OPTIONS.map((value) => ({ value, label: value })),
    },
    {
      key: "roomId",
      label: "部屋割",
      options: [
        { value: UNASSIGNED_ROOM_FILTER, label: "未割当" },
        ...rooms.map((r) => ({
          value: r.room_id,
          label: r.room_name,
        })),
      ],
    },
    {
      key: "payment_status",
      label: "支払い",
      options: LIST_FILTER_PAYMENT_OPTIONS.map((value) => ({
        value,
        label: value,
      })),
    },
    {
      key: "meal",
      label: "食事",
      options: LIST_FILTER_MEAL_OPTIONS.map((value) => ({ value, label: value })),
    },
    {
      key: "bbq",
      label: "BBQ",
      options: LIST_FILTER_BBQ_OPTIONS.map((value) => ({ value, label: value })),
    },
    {
      key: "companionInfo",
      label: "同行者情報",
      options: [
        { value: "未回答", label: "同行者未回答" },
        { value: "回答済み", label: "同行者回答済" },
      ],
    },
    {
      key: "completionEmail",
      label: "メール",
      options: [
        { value: "未送付", label: "メール未送付" },
        { value: "送付済", label: "メール送付済" },
      ],
    },
  ];

  return (
    <>
      <ReservationsListManualAdd />
      <ListScopeBar kind="reservation" scope={scope} />
      <Suspense fallback={null}>
        <ListSearchBar />
      </Suspense>
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
    </>
  );
}
