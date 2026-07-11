"use server";

import { revalidateMailTemplates } from "@/lib/cache/revalidate";import { nextTemplateId } from "@/lib/config/mail-templates";
import type { MailTemplate, MailTemplateCategory } from "@/lib/config/mail-templates";
import { getMailTemplates } from "@/lib/queries/mail-templates";
import { createStaffClient } from "@/lib/supabase/server";

type ActionResult =
  | { ok: true; templateId: string }
  | { ok: false; message: string };

function parseTemplateForm(formData: FormData, templateId: string): MailTemplate {
  return {
    templateId,
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "共通").trim() as MailTemplateCategory,
    defaultPurpose: String(formData.get("default_purpose") ?? "").trim(),
    subject: String(formData.get("subject") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    active: formData.get("active") === "true",
    sortOrder: parseInt(String(formData.get("sort_order") ?? "999"), 10) || 999,
    note: String(formData.get("note") ?? "").trim(),
  };
}

export async function saveMailTemplateAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const mode = String(formData.get("mode") ?? "edit");
  const existingId = String(formData.get("template_id") ?? "").trim();
  const { templates } = await getMailTemplates();
  const templateId =
    mode === "new" ? nextTemplateId(templates) : existingId;

  if (!templateId) return { ok: false, message: "テンプレートIDが不足しています。" };

  const tpl = parseTemplateForm(formData, templateId);
  if (!tpl.name) return { ok: false, message: "テンプレート名を入力してください。" };

  const supabase = await createStaffClient();
  const { error } = await supabase.from("mail_templates").upsert(
    {
      template_id: tpl.templateId,
      name: tpl.name,
      category: tpl.category,
      default_purpose: tpl.defaultPurpose,
      subject: tpl.subject,
      body: tpl.body,
      active: tpl.active,
      sort_order: tpl.sortOrder,
      note: tpl.note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "template_id" }
  );

  if (error) return { ok: false, message: error.message };
  revalidateMailTemplates();
  return { ok: true, templateId: tpl.templateId };
}

export async function deleteMailTemplateAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const templateId = String(formData.get("template_id") ?? "").trim();
  if (!templateId) return { ok: false, message: "テンプレートIDが不足しています。" };

  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("mail_templates")
    .delete()
    .eq("template_id", templateId);

  if (error) return { ok: false, message: error.message };
  revalidateMailTemplates();
  return { ok: true, templateId };
}

export async function seedMailTemplatesAction(): Promise<ActionResult> {
  const supabase = await createStaffClient();
  const { DEFAULT_MAIL_TEMPLATES } = await import("@/lib/config/mail-templates");
  const rows = DEFAULT_MAIL_TEMPLATES.map((t) => ({
    template_id: t.templateId,
    name: t.name,
    category: t.category,
    default_purpose: t.defaultPurpose,
    subject: t.subject,
    body: t.body,
    active: t.active,
    sort_order: t.sortOrder,
    note: t.note,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("mail_templates").upsert(rows, {
    onConflict: "template_id",
  });
  if (error) return { ok: false, message: error.message };
  revalidateMailTemplates();
  return { ok: true, templateId: "seed" };
}

export async function getActiveMailTemplatesAction() {
  const { templates, error } = await getMailTemplates();
  return {
    templates: templates.filter((t) => t.active),
    error,
  };
}
