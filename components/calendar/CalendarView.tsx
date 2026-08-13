"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type {
  DayCalendarView,
  MonthCalendarView,
  WeekCalendarView,
} from "@/lib/services/calendar";
import { shiftIsoDate, shiftMonth } from "@/lib/services/calendar";
import { TodayRoomsBoard } from "@/components/dashboard/TodayRoomsBoard";
import { ReservationDashboardCard } from "@/components/dashboard/ReservationDashboardCard";
import { NavDatePicker } from "@/components/calendar/NavDatePicker";
import type { DashboardListItem } from "@/lib/queries/dashboard";

type CalendarMode = "month" | "week" | "day";

type CalendarViewProps = {
  mode: CalendarMode;
  year: number;
  month: number;
  anchor: string;
  monthData: MonthCalendarView | null;
  weekData: WeekCalendarView | null;
  dayData: DayCalendarView | null;
};

function calendarHref(
  mode: CalendarMode,
  year: number,
  month: number,
  anchor: string
) {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (mode === "month") {
    params.set("year", String(year));
    params.set("month", String(month));
  } else {
    params.set("date", anchor);
  }
  return `/calendar?${params.toString()}`;
}

function toDashboardItem(card: DayCalendarView["checkinCards"][0]): DashboardListItem {
  return {
    reservationId: card.reservationId,
    representativeName: card.representativeName,
    status: card.status,
    checkIn: card.checkIn,
    checkOut: card.checkOut,
    guestTotal: card.guestTotal,
    adultMale: card.adultMale,
    adultFemale: card.adultFemale,
    boyStudent: card.boyStudent,
    girlStudent: card.girlStudent,
    age3plus: card.age3plus,
    under3: card.under3,
    meal: card.meal,
    bbq: card.bbq,
    somen: card.somen,
    inquiry: card.inquiry,
    internalMemo: card.internalMemo,
    guestMemo: card.guestMemo,
    arrivalTime: card.arrivalTime,
    vehicleCount: null,
    assignmentStatus: card.assignmentStatus,
    assignedRooms: card.assignedRooms,
    companionPending: false,
    companionGuestRequired: false,
    email: null,
    completionEmailSent: false,
    day11EmailSent: false,
    day3EmailSent: false,
    companionFormAnswered: false,
    createdAt: null,
    sheetCreatedAt: null,
  };
}

function MonthView({
  data,
  year,
  month,
}: {
  data: MonthCalendarView;
  year: number;
  month: number;
}) {
  const router = useRouter();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const monthValue = `${year}-${String(month).padStart(2, "0")}`;
  const prevHref = calendarHref("month", prev.year, prev.month, "");
  const nextHref = calendarHref("month", next.year, next.month, "");

  return (
    <>
      <div className="cal-nav">
        <Link href={prevHref} className="btn btn-secondary btn-sm cal-nav-btn">
          ←
        </Link>
        <NavDatePicker
          id="cal-month-input"
          label={`${year}年${month}月`}
          type="month"
          value={monthValue}
          onChange={(nextValue) => {
            const parts = nextValue.split("-");
            if (parts.length === 2) {
              router.push(
                calendarHref("month", Number(parts[0]), Number(parts[1]), "")
              );
            }
          }}
        />
        <Link href={nextHref} className="btn btn-secondary btn-sm cal-nav-btn">
          →
        </Link>
      </div>
      <div className="cal-month-wrap">
        <div className="cal-grid-head">
          {data.weekdayHeaders.map((w, idx) => (
            <span
              key={w}
              className={idx === 5 ? "sat" : idx === 6 ? "sun" : ""}
            >
              {w}
            </span>
          ))}
        </div>
        <div className="cal-grid-body">
          {Array.from({ length: data.gridStartOffset }).map((_, i) => (
            <div
              key={`pad-${i}`}
              className="cal-cell cal-cell-empty"
              aria-hidden
            />
          ))}
          {data.days.map((day) => (
            <Button
              key={day.date}
              type="button"
              variant="secondary"
              className={`cal-cell${day.isToday ? " today" : ""}${
                day.checkinLabel || day.checkoutLabel || day.stayingLabel
                  ? " has-event"
                  : ""
              }`}
              onClick={() =>
                router.push(calendarHref("day", year, month, day.date))
              }
            >
              <span className="cal-cell-num">{day.dayNum}</span>
              <div className="cal-cell-badges">
                {day.checkinLabel ? (
                  <span className="cal-badge cal-badge-in">{day.checkinLabel}</span>
                ) : null}
                {day.stayingLabel ? (
                  <span className="cal-badge cal-badge-stay">{day.stayingLabel}</span>
                ) : null}
                {day.checkoutLabel ? (
                  <span className="cal-badge cal-badge-out">{day.checkoutLabel}</span>
                ) : null}
              </div>
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}

function WeekView({
  data,
  anchor,
}: {
  data: WeekCalendarView;
  anchor: string;
}) {
  const router = useRouter();
  const prevHref = calendarHref("week", 0, 0, shiftIsoDate(anchor, -7));
  const nextHref = calendarHref("week", 0, 0, shiftIsoDate(anchor, 7));

  useEffect(() => {
    router.prefetch(prevHref);
    router.prefetch(nextHref);
  }, [anchor, nextHref, prevHref, router]);

  return (
    <>
      <div className="cal-nav">
        <Link href={prevHref} className="btn btn-secondary btn-sm cal-nav-btn">
          ←
        </Link>
        <NavDatePicker
          id="cal-week-input"
          label={`${data.weekStart} 〜`}
          type="date"
          value={data.weekStart}
          onChange={(nextValue) => {
            if (nextValue) {
              router.push(calendarHref("week", 0, 0, nextValue));
            }
          }}
        />
        <Link href={nextHref} className="btn btn-secondary btn-sm cal-nav-btn">
          →
        </Link>
      </div>
      <div className="week-days">
        {data.days.map((day) => (
          <article
            key={day.date}
            className={`card week-day${day.isToday ? " today" : ""}`}
          >
            <Button
              type="button"
              variant="secondary"
              className="week-day-head"
              onClick={() =>
                router.push(calendarHref("day", 0, 0, day.date))
              }
            >
              <p className="card-title">
                {day.dateLabel}（{day.weekday}）
              </p>
              <p className="mini">
                {[day.checkinLabel, day.stayingLabel, day.checkoutLabel]
                  .filter(Boolean)
                  .join(" ") || "予定なし"}
              </p>
            </Button>
            {day.events.map((ev) => (
              <Link
                key={`${ev.reservationId}-${ev.type}`}
                href={`/reservations/${encodeURIComponent(ev.reservationId)}`}
                prefetch
                className={`card-row event-card ${
                  ev.type === "checkin"
                    ? "event-in"
                    : ev.type === "checkout"
                      ? "event-out"
                      : "event-stay"
                }${ev.status === "仮予約" ? " event-provisional" : ""}`}
              >
                <span className="event-time">
                  {ev.typeLabel}
                  {ev.time
                    ? ` ${ev.time}`
                    : ev.nightNumber
                      ? ` ${ev.nightNumber}泊目`
                      : ""}
                </span>{" "}
                {ev.representativeName} {ev.guestCompact}
              </Link>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}

function DayView({ data, anchor }: { data: DayCalendarView; anchor: string }) {
  const router = useRouter();
  const prevHref = calendarHref("day", 0, 0, shiftIsoDate(anchor, -1));
  const nextHref = calendarHref("day", 0, 0, shiftIsoDate(anchor, 1));

  return (
    <>
      <div className="cal-nav">
        <Link href={prevHref} className="btn btn-secondary btn-sm cal-nav-btn">
          ←
        </Link>
        <NavDatePicker
          id="cal-day-input"
          label={data.dateLabel}
          type="date"
          value={data.date}
          onChange={(nextValue) => {
            if (nextValue) {
              router.push(calendarHref("day", 0, 0, nextValue));
            }
          }}
        />
        <Link href={nextHref} className="btn btn-secondary btn-sm cal-nav-btn">
          →
        </Link>
      </div>

      <div className="section-title">部屋割（{data.dateLabel}）</div>
      <TodayRoomsBoard rooms={data.todayRooms} />
      <Link
        href={`/rooms?month=${data.date.slice(0, 7)}&today=1`}
        className="btn btn-secondary btn-sm cal-rooms-link"
      >
        部屋割りボードで見る
      </Link>

      <div className="section-title">チェックイン</div>
      {data.checkinCards.length ? (
        data.checkinCards.map((card) => (
          <ReservationDashboardCard
            key={card.reservationId}
            item={toDashboardItem(card)}
          />
        ))
      ) : (
        <div className="empty">なし</div>
      )}

      <div className="section-title">滞在中</div>
      {data.staying.length ? (
        data.staying.map((card) => (
          <ReservationDashboardCard
            key={`${card.reservationId}-stay`}
            item={toDashboardItem(card)}
            nightNumber={card.nightNumber}
          />
        ))
      ) : (
        <div className="empty">なし</div>
      )}

      <div className="section-title">チェックアウト</div>
      {data.checkoutCards.length ? (
        data.checkoutCards.map((card) => (
          <ReservationDashboardCard
            key={card.reservationId}
            item={toDashboardItem(card)}
          />
        ))
      ) : (
        <div className="empty">なし</div>
      )}
    </>
  );
}

export function CalendarView({
  mode,
  year,
  month,
  anchor,
  monthData,
  weekData,
  dayData,
}: CalendarViewProps) {
  const router = useRouter();

  useEffect(() => {
    document.body.classList.toggle("cal-month-active", mode === "month");
    return () => {
      document.body.classList.remove("cal-month-active");
    };
  }, [mode]);

  return (
    <>
      <div className="tabs cal-view-tabs">
        {(
          [
            ["month", "月"],
            ["week", "週"],
            ["day", "日"],
          ] as const
        ).map(([m, label]) => (
          <Button
            key={m}
            type="button"
            variant="secondary"
            className={`tab${mode === m ? " active" : ""}`}
            onClick={() => {
              if (m === "month") {
                router.push(calendarHref("month", year, month, anchor));
              } else {
                router.push(calendarHref(m, 0, 0, anchor));
              }
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <div id="cal-body">
        {mode === "month" && monthData ? (
          <MonthView data={monthData} year={year} month={month} />
        ) : null}
        {mode === "week" && weekData ? (
          <WeekView data={weekData} anchor={anchor} />
        ) : null}
        {mode === "day" && dayData ? (
          <DayView data={dayData} anchor={anchor} />
        ) : null}
        {((mode === "month" && !monthData) ||
          (mode === "week" && !weekData) ||
          (mode === "day" && !dayData)) && (
          <div className="empty">カレンダーデータを読み込めませんでした</div>
        )}
      </div>
    </>
  );
}
