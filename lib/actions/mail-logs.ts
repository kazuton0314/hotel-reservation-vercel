"use server";

import { revalidateMailLogs } from "@/lib/cache/revalidate";
import { fetchResendEmailStatus } from "@/lib/services/resend-status";
import { createAdminClient } from "@/lib/supabase/server";

const STALE_PROVIDER_STATUSES = new Set([
  null,
  undefined,
  "",
  "sent",
  "queued",
  "scheduled",
]);

export async function syncMailLogStatusesAction(
  entityType: string,
  entityId: string
) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mail_logs")
    .select("mail_log_id, provider_id, provider_status")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "sent")
    .not("provider_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(8);

  const staleRows = (data ?? []).filter(
    (row) =>
      row.provider_id &&
      STALE_PROVIDER_STATUSES.has(row.provider_status as string | null)
  );
  if (!staleRows.length) return { updated: 0 };

  const results = await Promise.allSettled(
    staleRows.map(async (row) => {
      const remote = await fetchResendEmailStatus(row.provider_id!);
      if (!remote) return false;
      const { error } = await supabase
        .from("mail_logs")
        .update({
          provider_status: remote.status,
          provider_status_at: remote.at,
        })
        .eq("mail_log_id", row.mail_log_id);
      return !error;
    })
  );

  const updated = results.filter(
    (result) => result.status === "fulfilled" && result.value
  ).length;

  if (updated > 0) {
    revalidateMailLogs(entityType, entityId);
  }
  return { updated };
}
