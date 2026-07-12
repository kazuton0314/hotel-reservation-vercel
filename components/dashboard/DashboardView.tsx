"use client";

import { useRouter } from "next/navigation";
import type { DashboardSummary } from "@/lib/queries/dashboard";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import { Button } from "@/components/ui/button";
import {
  DashboardEmpty,
  DashboardSection,
  ReservationDashboardCard,
} from "@/components/dashboard/ReservationDashboardCard";
import { TodayRoomsBoard } from "@/components/dashboard/TodayRoomsBoard";

type Props = {
  dashboard: DashboardSummary;
};

function StatInfo({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat stat-info">
      <div className="num">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function StatButton({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="secondary" className="stat stat-btn" onClick={onClick}>
      <div className="num">{value}</div>
      <div className="label">{label}</div>
    </Button>
  );
}

function StatTodoButton({
  value,
  label,
  title,
  onClick,
}: {
  value: number;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  const urgent = value > 0 ? " stat-todo-urgent" : "";
  return (
    <Button
      type="button"
      variant="secondary"
      className={`stat stat-todo${urgent}`}
      title={title}
      onClick={onClick}
    >
      <div className="num">{value}</div>
      <div className="label">{label}</div>
    </Button>
  );
}

export function DashboardView({ dashboard: d }: Props) {
  const router = useRouter();

  const go = (href: string) => router.push(href);
  const syncText = d.lastSyncAt
    ? `${new Date(d.lastSyncAt).toLocaleString("ja-JP")} (${d.lastSyncStatus ?? "unknown"})`
    : "同期履歴なし";

  return (
    <>
      <p className="dashboard-date">{d.dateLabel}</p>
      <p className="dashboard-sync">
        最終同期: {syncText} / <a href="/settings/sync">同期ステータス</a> /{" "}
        <a href="/settings/mail">メール定型文</a>
      </p>

      <div className="stats-overview">
        <StatInfo value={d.todayCheckinCount} label="今日IN" />
        <StatInfo value={d.stayingCount} label="滞在中" />
        <StatInfo value={d.todayCheckoutCount} label="今日OUT" />
      </div>

      <div className="stats-status">
        <StatButton
          value={d.requestCount}
          label="リクエスト"
          onClick={() => go("/requests?status=リクエスト")}
        />
        <StatButton
          value={d.provisionalCount}
          label="仮予約"
          onClick={() => go("/reservations?period=provisional")}
        />
        <StatButton
          value={d.confirmedCount}
          label="確定"
          onClick={() => go("/reservations?period=confirmed")}
        />
      </div>

      <div className="stats-todos">
        <StatTodoButton
          value={d.companionPendingCount}
          label="同行者未回答"
          onClick={() =>
            go(
              "/reservations?period=confirmed&filterField=companionInfo&filterValue=" +
                encodeURIComponent("未回答")
            )
          }
        />
        <StatTodoButton
          value={d.reservationMailPendingCount}
          label={CONTACT_LABELS.todoLabel}
          title={CONTACT_LABELS.todoHint}
          onClick={() =>
            go(
              "/reservations?period=confirmed&filterField=completionEmail&filterValue=" +
                encodeURIComponent(CONTACT_LABELS.filterPending)
            )
          }
        />
        <StatTodoButton
          value={d.unassignedCount}
          label="部屋未割当"
          onClick={() =>
            go(
              "/reservations?period=confirmed&filterField=roomId&filterValue=__unassigned__"
            )
          }
        />
      </div>


      <DashboardSection title="部屋割（今日）">
        <TodayRoomsBoard rooms={d.todayRooms} />
      </DashboardSection>

      <DashboardSection title={`チェックイン ${d.todayCheckinCount}組`}>
        {d.todayCheckins.length === 0 ? (
          <DashboardEmpty />
        ) : (
          d.todayCheckins.map((item) => (
            <ReservationDashboardCard key={item.reservationId} item={item} />
          ))
        )}
      </DashboardSection>

      <DashboardSection title={`チェックアウト ${d.todayCheckoutCount}組`}>
        {d.todayCheckouts.length === 0 ? (
          <DashboardEmpty />
        ) : (
          d.todayCheckouts.map((item) => (
            <ReservationDashboardCard key={item.reservationId} item={item} />
          ))
        )}
      </DashboardSection>

      <DashboardSection title={`滞在中 ${d.stayingCount}組`}>
        {d.staying.length === 0 ? (
          <DashboardEmpty />
        ) : (
          d.staying.map((item) => (
            <ReservationDashboardCard
              key={item.reservationId}
              item={item}
              nightNumber={item.nightNumber}
            />
          ))
        )}
      </DashboardSection>
    </>
  );
}
