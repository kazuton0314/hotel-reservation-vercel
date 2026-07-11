import { createReadClient } from "@/lib/supabase/read";

export type MailLogItem = {
  mailLogId: string;
  entityType: string;
  entityId: string;
  toEmail: string;
  subject: string;
  bodyPreview: string;
  templateId: string | null;
  provider: string;
  providerId: string | null;
  status: string;
  providerStatus: string | null;
  providerStatusAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type DbMailLog = {
  mail_log_id: string;
  entity_type: string;
  entity_id: string;
  to_email: string;
  subject: string;
  body_preview: string;
  template_id: string | null;
  provider: string;
  provider_id: string | null;
  status: string;
  provider_status: string | null;
  provider_status_at: string | null;
  error_message: string | null;
  created_at: string;
};

function mapLog(row: DbMailLog): MailLogItem {
  return {
    mailLogId: row.mail_log_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    toEmail: row.to_email,
    subject: row.subject,
    bodyPreview: row.body_preview,
    templateId: row.template_id,
    provider: row.provider,
    providerId: row.provider_id,
    status: row.status,
    providerStatus: row.provider_status,
    providerStatusAt: row.provider_status_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export async function getMailLogsForEntity(
  entityType: string,
  entityId: string,
  limit = 30
) {
  return getMailLogsForEntityUncached(entityType, entityId, limit);
}

async function getMailLogsForEntityUncached(
  entityType: string,
  entityId: string,
  limit: number
) {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("mail_logs")
    .select(
      "mail_log_id, entity_type, entity_id, to_email, subject, body_preview, template_id, provider, provider_id, status, provider_status, provider_status_at, error_message, created_at"
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { logs: [] as MailLogItem[], error: error.message };
  }

  const logs = ((data ?? []) as DbMailLog[]).map(mapLog);
  return { logs, error: null };
}
