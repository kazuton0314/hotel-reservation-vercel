"use server";

import { revalidateMailLogs, revalidateRequestDetail, revalidateReservationDetail } from "@/lib/cache/revalidate";
import { buildMailEntityContext } from "@/lib/services/mail-context";
import { substituteMailPlaceholders } from "@/lib/services/mail-placeholders";
import { sendMail, resolveMailProvider } from "@/lib/services/mail-send";
import { createClient, createStaffClient } from "@/lib/supabase/server";

type SendResult =
  | { ok: true; providerId: string | null }
  | { ok: false; message: string; skipped?: boolean };

function bodyPreview(body: string, max = 240): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

export async function sendComposeMailAction(
  _prev: SendResult | null,
  formData: FormData
): Promise<SendResult> {
  const to = String(formData.get("to") ?? "").trim();
  const subjectRaw = String(formData.get("subject") ?? "").trim();
  const bodyRaw = String(formData.get("body") ?? "").trim();
  const entityType = String(formData.get("entity_type") ?? "general").trim();
  const entityId = String(formData.get("entity_id") ?? "").trim();
  const templateId = String(formData.get("template_id") ?? "").trim() || undefined;
  const mailKind = String(formData.get("mail_kind") ?? "").trim();

  if (!to) return { ok: false, message: "宛先メールアドレスがありません。" };
  if (!subjectRaw) return { ok: false, message: "件名を入力してください。" };
  if (!bodyRaw) return { ok: false, message: "本文を入力してください。" };

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  const supabase = await createStaffClient();
  const ctx = await buildMailEntityContext(supabase, entityType, entityId);
  const subject = substituteMailPlaceholders(subjectRaw, ctx);
  const body = substituteMailPlaceholders(bodyRaw, ctx);

  const result = await sendMail({
    to,
    subject,
    body,
    entityType,
    entityId,
    templateId,
  });

  const provider = result.ok ? result.provider : resolveMailProvider() ?? "smtp";

  const { error: logError } = await supabase.from("mail_logs").insert({
    entity_type: entityType,
    entity_id: entityId || "unknown",
    to_email: to,
    subject,
    body_preview: bodyPreview(body),
    template_id: templateId ?? null,
    provider,
    provider_id: result.ok ? result.providerId : null,
    status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    provider_status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
    provider_status_at: new Date().toISOString(),
    error_message: result.ok ? result.sentCopyError ?? null : result.message,
    sent_by: user?.id ?? null,
  });

  if (entityId && entityType !== "general") {
    revalidateMailLogs(entityType, entityId);
  }

  if (!result.ok) {
    if (logError) {
      return {
        ok: false,
        message: `${result.message}（履歴保存エラー: ${logError.message}）`,
        skipped: result.skipped,
      };
    }
    return result;
  }

  if (logError) {
    console.error("mail_logs insert failed:", logError.message);
  }

  const now = new Date().toISOString();

  if (entityType === "reservation" && entityId && mailKind) {
    const patch: Record<string, unknown> = { updated_at: now };
    if (mailKind === "予約確定" || mailKind === "仮予約") {
      patch.completion_email_sent = true;
      patch.completion_email_sent_at = now;
    } else if (mailKind === "11日前") {
      patch.day11_email_sent = true;
      patch.day11_email_sent_at = now;
    } else if (mailKind === "3日前") {
      patch.day3_email_sent = true;
      patch.day3_email_sent_at = now;
    }
    if (Object.keys(patch).length > 1) {
      const { error: updateError } = await supabase
        .from("reservations")
        .update(patch)
        .eq("reservation_id", entityId);
      if (updateError) {
        return {
          ok: false,
          message: `送信は成功しましたが送付済フラグの更新に失敗しました: ${updateError.message}`,
        };
      }
      revalidateReservationDetail(entityId);
    }
  }

  if (entityType === "request" && entityId) {
    const { error: updateError } = await supabase
      .from("reservation_requests")
      .update({
        reply_email_sent: true,
        reply_email_sent_at: now,
        updated_at: now,
      })
      .eq("request_id", entityId);
    if (updateError) {
      return {
        ok: false,
        message: `送信は成功しましたが送付済フラグの更新に失敗しました: ${updateError.message}`,
      };
    }
    revalidateRequestDetail(entityId);
  }

  return result;
}
