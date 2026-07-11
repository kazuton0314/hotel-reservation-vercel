"use server";

import { revalidateMailLogs } from "@/lib/cache/revalidate";
import { createAdminClient } from "@/lib/supabase/server";

type WebhookPayload = {
  type?: string;
  data?: {
    email_id?: string;
    created_at?: string;
  };
};

export async function handleResendWebhook(payload: WebhookPayload) {
  const emailId = payload.data?.email_id;
  if (!emailId) return { ok: false };

  const eventType = String(payload.type ?? "").replace("email.", "");
  const status =
    eventType === "delivered"
      ? "delivered"
      : eventType === "bounced"
        ? "bounced"
        : eventType === "complained"
          ? "complained"
          : eventType === "delivery_delayed"
            ? "delivery_delayed"
            : eventType === "sent"
              ? "sent"
              : eventType;

  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("mail_logs")
    .select("mail_log_id, entity_type, entity_id")
    .eq("provider_id", emailId)
    .limit(1);

  const row = rows?.[0];
  if (!row) return { ok: true, matched: false };

  await supabase
    .from("mail_logs")
    .update({
      provider_status: status,
      provider_status_at: payload.data?.created_at ?? new Date().toISOString(),
    })
    .eq("mail_log_id", row.mail_log_id);

  revalidateMailLogs(row.entity_type, row.entity_id);
  return { ok: true, matched: true };
}
