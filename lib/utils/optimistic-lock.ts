import type { SupabaseClient } from "@supabase/supabase-js";

export const CONFLICT_MESSAGE =
  "他の操作と競合しました。最新の内容を読み込み直してから再度お試しください。";

type UpdateResult<T> =
  | { ok: true; data: T }
  | { ok: false; conflict: boolean; message: string };

export async function updateRowWithLock<T extends Record<string, unknown>>({
  supabase,
  table,
  idColumn,
  idValue,
  expectedUpdatedAt,
  patch,
}: {
  supabase: SupabaseClient;
  table: string;
  idColumn: string;
  idValue: string;
  expectedUpdatedAt?: string | null;
  patch: Record<string, unknown>;
}): Promise<UpdateResult<T>> {
  let query = supabase.from(table).update(patch).eq(idColumn, idValue);

  if (expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) {
    return { ok: false, conflict: false, message: error.message };
  }

  if (!data) {
    return {
      ok: false,
      conflict: Boolean(expectedUpdatedAt),
      message: expectedUpdatedAt ? CONFLICT_MESSAGE : "対象データが見つかりません。",
    };
  }

  return { ok: true, data: data as T };
}
