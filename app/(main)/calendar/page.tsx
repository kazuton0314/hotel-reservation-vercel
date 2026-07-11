import { ConnectionError } from "@/components/SetupRequired";
import { CalendarView } from "@/components/calendar/CalendarView";
import {
  getDayCalendar,
  getMonthCalendar,
  getWeekCalendar,
} from "@/lib/queries/calendar";
import { defaultCalendarAnchor } from "@/lib/services/calendar";

type PageProps = {
  searchParams: Promise<{
    mode?: string;
    year?: string;
    month?: string;
    date?: string;
  }>;
};

export default async function CalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  return <CalendarContent params={params} />;
}

async function CalendarContent({
  params,
}: {
  params: { mode?: string; year?: string; month?: string; date?: string };
}) {
  const mode =
    params.mode === "week" || params.mode === "day" ? params.mode : "month";
  const now = new Date();
  const year = parseInt(params.year ?? String(now.getFullYear()), 10);
  const month = parseInt(params.month ?? String(now.getMonth() + 1), 10);
  const anchor = params.date || defaultCalendarAnchor();

  const [monthResult, weekResult, dayResult] = await Promise.all([
    mode === "month"
      ? getMonthCalendar(year, month)
      : Promise.resolve({ data: null, error: null }),
    mode === "week"
      ? getWeekCalendar(anchor)
      : Promise.resolve({ data: null, error: null }),
    mode === "day"
      ? getDayCalendar(anchor)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const error =
    monthResult.error || weekResult.error || dayResult.error || null;
  if (error) {
    return <ConnectionError message={error} />;
  }

  return (
    <CalendarView
      key={`${mode}-${year}-${month}-${anchor}`}
      mode={mode}
      year={year}
      month={month}
      anchor={anchor}
      monthData={monthResult.data}
      weekData={weekResult.data}
      dayData={dayResult.data}
    />
  );
}
