import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import type { MailTemplate } from "@/lib/config/mail-templates";
import { DEFAULT_MAIL_TEMPLATES } from "@/lib/config/mail-templates";

type DbMailTemplate = {
  template_id: string;
  name: string;
  category: string;
  default_purpose: string;
  subject: string;
  body: string;
  active: boolean;
  sort_order: number;
  note: string;
};

function rowToTemplate(row: DbMailTemplate): MailTemplate {
  return {
    templateId: row.template_id,
    name: row.name,
    category: row.category as MailTemplate["category"],
    defaultPurpose: row.default_purpose ?? "",
    subject: row.subject ?? "",
    body: row.body ?? "",
    active: row.active,
    sortOrder: row.sort_order,
    note: row.note ?? "",
  };
}

async function fetchMailTemplatesUncached(): Promise<{
  templates: MailTemplate[];
  error: string | null;
  tableMissing: boolean;
}> {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("mail_templates")
    .select(
      "template_id, name, category, default_purpose, subject, body, active, sort_order, note"
    )
    .order("sort_order", { ascending: true });

  if (error) {
    const msg = error.message ?? "";
    if (/mail_templates/i.test(msg) && /schema cache|does not exist/i.test(msg)) {
      return {
        templates: DEFAULT_MAIL_TEMPLATES,
        error: null,
        tableMissing: true,
      };
    }
    return { templates: [], error: msg, tableMissing: false };
  }

  return {
    templates: ((data ?? []) as DbMailTemplate[]).map(rowToTemplate),
    error: null,
    tableMissing: false,
  };
}

export async function getMailTemplates() {
  return unstable_cache(
    fetchMailTemplatesUncached,
    ["mail-templates"],
    { tags: [CACHE_TAGS.mailTemplates], revalidate: 60 }
  )();
}

export async function getMailTemplateById(templateId: string) {
  const { templates, error } = await getMailTemplates();
  if (error) return { template: null, error };
  const template = templates.find((t) => t.templateId === templateId) ?? null;
  return { template, error: null };
}
