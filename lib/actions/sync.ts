"use server";

import { revalidateAfterSync } from "@/lib/cache/revalidate";
import { syncAllForms } from "@/lib/import/sync-forms";
import { createAdminClient } from "@/lib/supabase/server";

type ImportResult =
  | { ok: true; imported: number; message: string }
  | { ok: false; message: string };

export async function importReservationsAction(): Promise<ImportResult> {
  try {
    const supabase = createAdminClient();
    const result = await syncAllForms(supabase);
    const imported = result.request.imported + result.studio.imported;

    revalidateAfterSync();

    return {
      ok: true,
      imported,
      message:
        imported > 0
          ? `新規${imported}件を反映しました`
          : "新しい予約はありませんでした",
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
