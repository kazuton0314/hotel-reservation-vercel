"use server";

import { after } from "next/server";
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
    if (process.env.FORM_SYNC_DISABLED === "true") {
      return {
        ok: false,
        message:
          "フォーム同期は一時停止中です（FORM_SYNC_DISABLED=true）。復旧完了後に解除してください。",
      };
    }

    const supabase = createAdminClient();
    const { data: job, error: jobError } = await supabase
      .from("import_job_runs")
      .insert({
        job_name: "form_sync",
        source: "ui",
        status: "running",
      })
      .select("id")
      .single();

    if (jobError) {
      return { ok: false, message: jobError.message };
    }

    const jobId = job.id as string;

    after(async () => {
      const admin = createAdminClient();
      try {
        const result = await syncAllForms(admin);
        const imported = result.request.imported + result.studio.imported;
        const skipped =
          result.request.skippedAlreadyLogged +
          result.request.skippedAlreadyInDb +
          result.studio.skippedAlreadyLogged +
          result.studio.skippedAlreadyInDb;
        const notImportable =
          result.request.skippedNotImportable +
          result.studio.skippedNotImportable;
        const errSuffix = summarizeImportErrors(
          result.request.errors,
          result.studio.errors
        );

        let message: string;
        if (imported > 0) {
          message = `新規${imported}件を反映しました${errSuffix}`;
        } else {
          const parts = [
            "新しい予約はありませんでした",
            skipped > 0 ? `取込済スキップ${skipped}件` : null,
            notImportable > 0 ? `取込不可${notImportable}件` : null,
          ].filter(Boolean);
          message = `${parts.join(" / ")}${errSuffix}`;
        }

        await admin
          .from("import_job_runs")
          .update({
            status: "success",
            finished_at: new Date().toISOString(),
            details: {
              imported,
              message,
              request: result.request,
              studio: result.studio,
            },
          })
          .eq("id", jobId);

        revalidateAfterSync();
      } catch (e) {
        await admin
          .from("import_job_runs")
          .update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: e instanceof Error ? e.message : String(e),
          })
          .eq("id", jobId);
      }
    });

    return {
      ok: true,
      imported: 0,
      message:
        "取込を開始しました。完了後に一覧・ダッシュボードへ反映されます。",
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
