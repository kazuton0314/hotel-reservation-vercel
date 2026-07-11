import { Resend } from "resend";

export type ResendDeliveryStatus =
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "failed"
  | "unknown";

export async function fetchResendEmailStatus(
  providerId: string
): Promise<{ status: ResendDeliveryStatus; at: string | null } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !providerId) return null;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.get(providerId);
    if (error || !data) return null;

    const lastEvent = String(data.last_event ?? "sent").toLowerCase();
    const mapped: ResendDeliveryStatus =
      lastEvent === "delivered"
        ? "delivered"
        : lastEvent === "bounced"
          ? "bounced"
          : lastEvent === "complained"
            ? "complained"
            : lastEvent === "delivery_delayed"
              ? "delivery_delayed"
              : lastEvent === "failed"
                ? "failed"
                : "sent";

    return {
      status: mapped,
      at: data.created_at ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function resendStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "delivered":
      return "配信済";
    case "sent":
      return "送信済";
    case "delivery_delayed":
      return "配信遅延";
    case "bounced":
      return "バウンス";
    case "complained":
      return "苦情";
    case "failed":
      return "失敗";
    case "skipped":
      return "未送信（設定なし）";
    default:
      return status ?? "—";
  }
}
