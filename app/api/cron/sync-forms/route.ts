import { NextRequest, NextResponse } from "next/server";
import { syncAllForms } from "@/lib/import/sync-forms";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createAdminClient } from "@/lib/supabase/server";

function revalidateAfterCronSync() {
  revalidateTag(CACHE_TAGS.dashboard, "max");
  revalidateTag(CACHE_TAGS.calendar, "max");
  revalidateTag(CACHE_TAGS.reservations, "max");
  revalidateTag(CACHE_TAGS.requests, "max");
  revalidateTag(CACHE_TAGS.customers, "max");
  revalidateTag(CACHE_TAGS.rooms, "max");
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    // 同期が止まっていても DB へ触れて Pause を防ぐ
    await supabase.from("rooms").select("room_id", { count: "exact", head: true });

    if (process.env.FORM_SYNC_DISABLED === "true") {
      return NextResponse.json({
        ok: false,
        paused: true,
        keepalive: true,
        error: "フォーム同期は一時停止中です（FORM_SYNC_DISABLED=true）",
      });
    }
    const result = await syncAllForms(supabase);
    revalidateAfterCronSync();
    return NextResponse.json({
      ok: true,
      request: result.request,
      studio: result.studio,
      postLink: result.postLink,
      archive: result.archive,
      gcal: result.gcal,
      runId: result.runId,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
