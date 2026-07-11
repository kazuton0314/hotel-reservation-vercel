"use server";

import { revalidateMailLogs } from "@/lib/cache/revalidate";
import { fetchResendEmailStatus } from "@/lib/services/resend-status";
import { createAdminClient } from "@/lib/supabase/server";

export async function syncMailLogStatusesAction(
  entityType: string,
  entityId: string
) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mail_logs")
    .select("mail_log_id, provider_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "sent")
    .not("provider_id", "is", null)
    .or("provider_status.is.null,provider_status.eq.sent")
    .order("created_at", { ascending: false })
    .limit(8);

  if (!data?.length) return { updated: 0 };

  let updated = 0;
  for (const row of data) {
    if (!row.provider_id) continue;
    const remote = await fetchResendEmailStatus(row.provider_id);
    if (!remote) continue;
    const { error } = await supabase
      .from("mail_logs")
      .update({
        provider_status: remote.status,
        provider_status_at: remote.at,
      })
      .eq("mail_log_id", row.mail_log_id);
    if (!error) updated += 1;
  }

  revalidateMailLogs(entityType, entityId);
  return { updated };
}
