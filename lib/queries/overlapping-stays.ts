import { createReadClient } from "@/lib/supabase/read";

export type OverlapStayItem = {
  reservation_id: string;
  representative_name: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  guest_total: string | null;
};

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function overlapsPeriod(
  checkIn: string | null,
  checkOut: string | null,
  periodStart: Date,
  periodEnd: Date
): boolean {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (!start || !end) return false;
  return start.getTime() <= periodEnd.getTime() && end.getTime() >= periodStart.getTime();
}

export async function getOverlappingStays(
  checkIn: string,
  checkOut: string | null,
  excludeReservationId?: string | null
) {
  const periodStart = parseDateOnly(checkIn);
  const periodEnd = parseDateOnly(checkOut || checkIn);
  if (!periodStart || !periodEnd) {
    return { stays: [] as OverlapStayItem[], error: null };
  }

  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, check_in, check_out, status, guest_total, is_archived"
    )
    .neq("status", "キャンセル");

  if (error) {
    return { stays: [] as OverlapStayItem[], error: error.message };
  }

  const excludeId = String(excludeReservationId || "").trim();
  const stays = (data ?? [])
    .filter((row) => {
      if (excludeId && row.reservation_id === excludeId) return false;
      return overlapsPeriod(row.check_in, row.check_out, periodStart, periodEnd);
    })
    .sort((a, b) => {
      const aIn = a.check_in || "";
      const bIn = b.check_in || "";
      if (aIn !== bIn) return aIn < bIn ? -1 : 1;
      return (a.representative_name || "").localeCompare(
        b.representative_name || "",
        "ja"
      );
    }) as OverlapStayItem[];

  return { stays, error: null };
}
