import type { SupabaseClient } from "@supabase/supabase-js";

/** リクエストID → 問い合わせ本文（空は Map に入れない） */
export async function loadRequestInquiriesByIds(
  supabase: SupabaseClient,
  requestIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(requestIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  if (!unique.length) return map;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("reservation_requests")
      .select("request_id, inquiry")
      .in("request_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const text = String(row.inquiry ?? "").trim();
      if (text) map.set(String(row.request_id), text);
    }
  }
  return map;
}

export async function loadRequestInquiryById(
  supabase: SupabaseClient,
  requestId: string | null | undefined
): Promise<string | null> {
  const id = String(requestId ?? "").trim();
  if (!id) return null;
  const map = await loadRequestInquiriesByIds(supabase, [id]);
  return map.get(id) ?? null;
}
