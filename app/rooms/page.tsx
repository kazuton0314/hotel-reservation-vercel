import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ConnectionError } from "@/components/SetupRequired";
import { PageHeader } from "@/components/PageHeader";
import { SupabaseGate } from "@/components/SupabaseGate";
import {
  getRoomAssignmentsForRange,
  getRooms,
  type RoomAssignmentBoardItem,
} from "@/lib/queries/rooms";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function RoomsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const month = parseMonth(params.month);
  const monthStart = new Date(month.year, month.month - 1, 1);
  const monthEnd = new Date(month.year, month.month, 0);
  const from = formatDate(monthStart);
  const to = formatDate(monthEnd);

  const [{ rooms, error: roomError }, { assignments, error: assignmentError }] =
    await Promise.all([getRooms(), getRoomAssignmentsForRange(from, to)]);

  const prev = shiftMonth(month.year, month.month, -1);
  const next = shiftMonth(month.year, month.month, 1);

  return (
    <SupabaseGate>
      <AppShell>
        <PageHeader
          title="部屋割りボード（読み取り）"
          description={`${month.year}年${month.month}月 / 既存GASの部屋割りボード相当（表示版）`}
        />

        {roomError ? <ConnectionError message={roomError} /> : null}
        {assignmentError ? <ConnectionError message={assignmentError} /> : null}

        {!roomError && !assignmentError ? (
          <>
            <div className="mb-4 flex items-center justify-between text-sm">
              <Link
                href={`/rooms?month=${prev.year}-${String(prev.month).padStart(2, "0")}`}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5"
              >
                ← 前月
              </Link>
              <span className="font-semibold">
                {month.year}年{month.month}月
              </span>
              <Link
                href={`/rooms?month=${next.year}-${String(next.month).padStart(2, "0")}`}
                className="rounded border border-zinc-300 bg-white px-3 py-1.5"
              >
                次月 →
              </Link>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-left">
                      部屋
                    </th>
                    {Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1).map(
                      (day) => (
                        <th
                          key={day}
                          className="border-b border-r border-zinc-200 px-2 py-2 font-medium"
                        >
                          {day}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room.room_id}>
                      <th className="sticky left-0 z-10 w-28 border-b border-r border-zinc-200 bg-white px-2 py-2 text-left font-medium">
                        {room.room_name}
                      </th>
                      {Array.from({ length: monthEnd.getDate() }, (_, i) => i + 1).map(
                        (day) => {
                          const date = formatDate(
                            new Date(month.year, month.month - 1, day)
                          );
                          const items = findAssignments(assignments, room.room_id, date);
                          return (
                            <td
                              key={`${room.room_id}-${day}`}
                              className="border-b border-r border-zinc-100 px-1 py-1 align-top"
                            >
                              {items.length > 0 ? (
                                <div className="space-y-1">
                                  {items.map((item) => (
                                    <Link
                                      key={item.room_assignment_id}
                                      href={`/reservations/${encodeURIComponent(
                                        item.reservation_id
                                      )}`}
                                      className="block rounded bg-emerald-100 px-1 py-0.5 text-[10px] leading-4 text-emerald-900 hover:bg-emerald-200"
                                      title={`${item.reservation_id} / ${
                                        item.assigned_guest_count ?? "—"
                                      }名`}
                                    >
                                      {item.reservation_id}
                                    </Link>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-zinc-300">·</span>
                              )}
                            </td>
                          );
                        }
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </AppShell>
    </SupabaseGate>
  );
}

function findAssignments(
  assignments: RoomAssignmentBoardItem[],
  roomId: string,
  date: string
) {
  return assignments.filter((a) => {
    if (a.room_id !== roomId) return false;
    return a.stay_start <= date && a.stay_end >= date;
  });
}

function parseMonth(raw?: string) {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map((v) => parseInt(v, 10));
    if (m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function shiftMonth(year: number, month: number, diff: number) {
  const d = new Date(year, month - 1 + diff, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
