import { createReadClient } from "@/lib/supabase/read";

export type OverlapStayItem = {
  reservation_id: string;
  representative_name: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  guest_total: string | null;
};

function toDateIso(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export async function getOverlappingStays(
  checkIn: string,
  checkOut: string | null,
  excludeReservationId?: string | null
) {
  const periodStart = toDateIso(checkIn);
  const periodEnd = toDateIso(checkOut || checkIn);
  if (!periodStart || !periodEnd) {
    return { stays: [] as OverlapStayItem[], error: null };
  }

  const supabase = await createReadClient();
  let query = supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, check_in, check_out, status, guest_total"
    )
    .neq("status", "キャンセル")
    .lte("check_in", periodEnd)
    .gte("check_out", periodStart)
    .order("check_in", { ascending: true, nullsFirst: false })
    .order("representative_name", { ascending: true, nullsFirst: false });

  const excludeId = String(excludeReservationId || "").trim();
  if (excludeId) {
    query = query.neq("reservation_id", excludeId);
  }

  const { data, error } = await query;

  if (error) {
    return { stays: [] as OverlapStayItem[], error: error.message };
  }

  return {
    stays: (data ?? []) as OverlapStayItem[],
    error: null,
  };
}
