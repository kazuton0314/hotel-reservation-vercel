"use server";

import { revalidateAfterSync } from "@/lib/cache/revalidate";
import { syncAllForms } from "@/lib/import/sync-forms";
import { createAdminClient } from "@/lib/supabase/server";

type ImportResult =
  | { ok: true; imported: number; message: string }
  | { ok: false; message: string };

function summarizeImportErrors(
  requestErrors: string[],
  studioErrors: string[]
): string {
  const all = [...requestErrors, ...studioErrors];
  if (all.length === 0) return "";
  const head = all.slice(0, 3).join(" / ");
  const more = all.length > 3 ? ` 他${all.length - 3}件` : "";
  return `（エラー: ${head}${more}）`;
}

export async function importReservationsAction(): Promise<ImportResult> {
  try {
    const supabase = createAdminClient();
    const result = await syncAllForms(supabase);
    const imported = result.request.imported + result.studio.imported;
    const skipped =
      result.request.skippedAlreadyLogged +
      result.request.skippedAlreadyInDb +
      result.studio.skippedAlreadyLogged +
      result.studio.skippedAlreadyInDb;
    const notImportable =
      result.request.skippedNotImportable + result.studio.skippedNotImportable;
    const errSuffix = summarizeImportErrors(
      result.request.errors,
      result.studio.errors
    );

    revalidateAfterSync();

    if (imported > 0) {
      return {
        ok: true,
        imported,
        message: `新規${imported}件を反映しました${errSuffix}`,
      };
    }

    const parts = [
      "新しい予約はありませんでした",
      skipped > 0 ? `取込済スキップ${skipped}件` : null,
      notImportable > 0 ? `取込不可${notImportable}件` : null,
    ].filter(Boolean);

    return {
      ok: true,
      imported: 0,
      message: `${parts.join(" / ")}${errSuffix}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
