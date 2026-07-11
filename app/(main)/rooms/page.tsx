import { ConnectionError } from "@/components/SetupRequired";
import { RoomOccupancyBoard } from "@/components/rooms/RoomOccupancyBoard";
import { getRoomOccupancyMonthView } from "@/lib/queries/room-occupancy";

type PageProps = {
  searchParams: Promise<{ month?: string; today?: string }>;
};

export default async function RoomsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const month = parseMonth(params.month);
  const { data, error } = await getRoomOccupancyMonthView(
    month.year,
    month.month
  );

  if (error) return <ConnectionError message={error} />;
  if (!data) return <div className="empty">部屋割データがありません</div>;

  return (
    <RoomOccupancyBoard data={data} scrollToToday={params.today === "1"} />
  );
}

function parseMonth(raw?: string) {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map((v) => parseInt(v, 10));
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}
