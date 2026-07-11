import { Suspense } from "react";
import { ListPagination } from "@/components/list/ListPagination";
import { ListSearchBar } from "@/components/list/ListSearchBar";
import { ReservationListRow } from "@/components/reservations/ReservationListRow";
import { ReservationsListManualAdd } from "@/components/reservations/ReservationsListManualAdd";
import {
  LIST_FILTER_BBQ_OPTIONS,
  LIST_FILTER_CHANNEL_OPTIONS,
  LIST_FILTER_MEAL_OPTIONS,
  LIST_FILTER_PAYMENT_OPTIONS,
} from "@/lib/config/field-options";
import { ConnectionError } from "@/components/SetupRequired";
import { ListScopeBar } from "@/components/list/ListScopeBar";
import { listScopeLabel, parseListScope } from "@/lib/utils/list-scope";
import {
  ReservationListFilterBar,
  type ListFilterFieldDef,
} from "@/components/list/ReservationListFilterBar";
import { ListStatusTabs } from "@/components/list/ListStatusTabs";
import { getReservations } from "@/lib/queries/reservations";
import { getRooms } from "@/lib/queries/rooms";
import {
  applyReservationListFilter,
  UNASSIGNED_ROOM_FILTER,
} from "@/lib/services/reservation-list-filter";
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
    sort?: string;
    dir?: string;
    page?: string;
    q?: string;
    checkIn?: string;
  };
}) {
  const scope = parseListScope(params.scope);
  const period = resolvePeriod(params);
  const sort = parseListSort(params.sort, params.dir);
  const page = parsePageParam(params.page);

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

  const filtered = applyReservationListFilter(
    reservations,
    params.filterField,
    params.filterValue
  );
  const searched = filterListBySearch(
    filtered.map((item) => ({ ...item, id: item.reservation_id })),
    params.q,
    params.checkIn
  );
  const sorted = sortListItems(searched, sort);
  const paged = paginateItems(sorted, page, DEFAULT_LIST_PAGE_SIZE);
  const scopeLabel = listScopeLabel(scope);

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
      <p className="list-sort-summary">
        {sorted.length}件（{scopeLabel}） / {listSortDirLabel(sort)}
      </p>
      {sorted.length ? (
        <>
          {paged.items.map((item) => (
            <ReservationListRow key={item.reservation_id} item={item} />
          ))}
          <ListPagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            basePath="/reservations"
            searchParams={params}
          />
        </>
      ) : (
        <div className="empty">該当する予約はありません</div>
      )}
    </>
  );
}
