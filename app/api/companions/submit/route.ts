import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

type CompanionInput = {
  name: string;
  nameKana?: string;
  age?: string;
  gender?: string;
};

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = process.env.COMPANION_API_TOKEN ?? "";
  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const reservationId = String(body?.reservationId ?? "").trim();
  const accessKey = String(body?.accessKey ?? "").trim();
  const companions = (Array.isArray(body?.companions) ? body.companions : []) as CompanionInput[];
  if (!reservationId || !accessKey || companions.length === 0) {
    return NextResponse.json({ ok: false, message: "invalid payload" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("reservation_id,access_key")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (reservationError || !reservation) {
    return NextResponse.json({ ok: false, message: "reservation not found" }, { status: 404 });
  }
  if (reservation.access_key !== accessKey) {
    return NextResponse.json({ ok: false, message: "access key mismatch" }, { status: 403 });
  }

  const rows = companions
    .map((c, idx) => ({
      reservation_id: reservationId,
      access_key: accessKey,
      entry_no: idx + 1,
      name: String(c.name ?? "").trim(),
      name_kana: String(c.nameKana ?? "").trim() || null,
      age: String(c.age ?? "").trim() || null,
      gender: String(c.gender ?? "").trim() || null,
      source: "外部フォーム",
      answered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    .filter((r) => r.name);
  if (!rows.length) {
    return NextResponse.json({ ok: false, message: "companions empty" }, { status: 400 });
  }

  const { error: upsertError } = await supabase
    .from("companions")
    .upsert(rows, { onConflict: "reservation_id,entry_no" });
  if (upsertError) {
    return NextResponse.json({ ok: false, message: upsertError.message }, { status: 500 });
  }

  await supabase
    .from("reservations")
    .update({
      companion_form_answered: true,
      updated_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId);

  return NextResponse.json({ ok: true, count: rows.length });
}
