"use client";

import Link from "next/link";
import type { DashboardSummary } from "@/lib/queries/dashboard";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import {
  DashboardEmpty,
  DashboardSection,
  ReservationDashboardCard,
} from "@/components/dashboard/ReservationDashboardCard";
import { TodayRoomsBoard } from "@/components/dashboard/TodayRoomsBoard";
import { formatDateTimeJa } from "@/lib/utils/date-label";

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

function StatNavLink({
  href,
  value,
  label,
  title,
  variant = "status",
}: {
  href: string;
  value: number;
  label: string;
  title?: string;
  variant?: "status" | "todo";
}) {
  const urgent = variant === "todo" && value > 0 ? " stat-todo-urgent" : "";
  const className =
    variant === "todo" ? `stat stat-todo${urgent}` : "stat stat-btn";

  return (
    <Link href={href} prefetch className={className} title={title}>
      <div className="num">{value}</div>
      <div className="label">{label}</div>
    </Link>
  );
}

export function DashboardView({ dashboard: d }: Props) {
  const syncText = d.lastSyncAt
    ? `${formatDateTimeJa(d.lastSyncAt)} (${d.lastSyncStatus ?? "unknown"})`
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
        <StatNavLink
          href="/requests?status=リクエスト"
          value={d.requestCount}
          label="リクエスト"
          title="これから（チェックアウトが今日以降）のリクエスト"
        />
        <StatNavLink
          href="/reservations?period=provisional"
          value={d.provisionalCount}
          label="仮予約"
          title="これから（チェックアウトが今日以降）の仮予約"
        />
        <StatNavLink
          href="/reservations?period=confirmed"
          value={d.confirmedCount}
          label="確定"
          title="これから（チェックアウトが今日以降）の確定予約"
        />
      </div>

      <div className="stats-todos">
        <StatNavLink
          variant="todo"
          value={d.companionPendingCount}
          label="同行者未回答"
          title="確定かつ2名以上で同行者フォーム未回答（1名予約は対象外）"
          href={
            "/reservations?period=confirmed&filterField=companionInfo&filterValue=" +
            encodeURIComponent("未回答")
          }
        />
        <StatNavLink
          variant="todo"
          value={d.reservationMailPendingCount}
          label={CONTACT_LABELS.todoLabel}
          title={CONTACT_LABELS.todoHint}
          href={
            "/reservations?period=confirmed&filterField=completionEmail&filterValue=" +
            encodeURIComponent(CONTACT_LABELS.filterPending)
          }
        />
        <StatNavLink
          variant="todo"
          value={d.unassignedCount}
          label="部屋未割当"
          title="確定予約で部屋未割当、または割当人数が宿泊人数と不一致"
          href="/reservations?period=confirmed&filterField=roomId&filterValue=__unassigned__"
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

      <DashboardSection title={`チェックアウト ${d.todayCheckoutCount}組`}>
        {d.todayCheckouts.length === 0 ? (
          <DashboardEmpty />
        ) : (
          d.todayCheckouts.map((item) => (
            <ReservationDashboardCard key={item.reservationId} item={item} />
          ))
        )}
      </DashboardSection>
    </>
  );
}
