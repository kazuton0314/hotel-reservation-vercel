import { FORM_SOURCES } from "@/lib/config/forms";
import { getMailSendConfigStatus } from "@/lib/services/mail-send";

export type SetupCheckId =
  | "supabase_url"
  | "supabase_anon"
  | "supabase_service_role"
  | "google_sa_email"
  | "google_sa_key"
  | "booking_spreadsheet"
  | "request_spreadsheet"
  | "cron_secret"
  | "mail_smtp"
  | "mail_from";

export type SetupCheck = {
  id: SetupCheckId;
  label: string;
  ok: boolean;
  detail: string;
  userAction?: string;
};

function maskId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function getSetupChecks(): SetupCheck[] {
  const saEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() ?? "";
  const bookingId = FORM_SOURCES.booking.spreadsheetId;
  const requestId = FORM_SOURCES.request.spreadsheetId;

  return [
    {
      id: "supabase_url",
      label: "Supabase URL",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      detail: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? "設定済み"
        : "未設定",
    },
    {
      id: "supabase_anon",
      label: "Supabase Anon Key",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      detail: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "設定済み" : "未設定",
    },
    {
      id: "supabase_service_role",
      label: "Supabase Service Role Key",
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      detail: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "設定済み（CSV取込・sync:forms に必要）"
        : "未設定",
      userAction: "Supabase → Settings → API → service_role",
    },
    {
      id: "google_sa_email",
      label: "Google サービスアカウント",
      ok: Boolean(saEmail),
      detail: saEmail || "未設定",
      userAction:
        "GCP でサービスアカウント作成 → client_email を .env.local に",
    },
    {
      id: "google_sa_key",
      label: "Google 秘密鍵",
      ok: Boolean(saKey && saKey.includes("BEGIN PRIVATE KEY")),
      detail: saKey ? "設定済み" : "未設定",
      userAction: "JSON 鍵の private_key を GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY に",
    },
    {
      id: "booking_spreadsheet",
      label: "本予約テストスプシ ID",
      ok: Boolean(bookingId),
      detail: maskId(bookingId),
    },
    {
      id: "request_spreadsheet",
      label: "リクエストテストスプシ ID",
      ok: Boolean(requestId),
      detail: maskId(requestId),
    },
    {
      id: "cron_secret",
      label: "CRON_SECRET",
      ok: Boolean(process.env.CRON_SECRET?.trim()),
      detail: process.env.CRON_SECRET ? "設定済み" : "未設定（Vercel 本番時）",
    },
    {
      id: "mail_smtp",
      label: "メール送信",
      ok: (() => {
        const mail = getMailSendConfigStatus();
        return mail.ready;
      })(),
      detail: (() => {
        const mail = getMailSendConfigStatus();
        if (mail.ready && mail.provider === "smtp") {
          const host = process.env.SMTP_HOST?.trim();
          const port = process.env.SMTP_PORT ?? 587;
          const vercelNote =
            process.env.VERCEL === "1"
              ? "（Vercel: さくらSMTPはIP制限で失敗しやすい → resend 推奨）"
              : "";
          return `SMTP ${host}:${port}（差出人: ${mail.fromHeader}）${vercelNote}`;
        }
        if (mail.ready && mail.provider === "resend") {
          return `Resend（差出人: ${mail.fromHeader}）`;
        }
        if (mail.missing.length) {
          return `不足: ${mail.missing.join(", ")}`;
        }
        return "未設定（MAIL_PROVIDER=smtp または resend）";
      })(),
      userAction:
        "ローカル: さくら SMTP。Vercel 本番: MAIL_PROVIDER=resend + RESEND_API_KEY + ドメイン認証",
    },
    {
      id: "mail_from",
      label: "差出人（MAIL_FROM）",
      ok: Boolean(getMailSendConfigStatus().fromHeader),
      detail: getMailSendConfigStatus().fromHeader || "未設定",
      userAction:
        "MAIL_FROM=表示名 <address@domain> または MAIL_FROM_ADDRESS + MAIL_FROM_NAME",
    },
  ];
}

export function isSupabaseReady(): boolean {
  return getSetupChecks()
    .filter((c) => c.id.startsWith("supabase_"))
    .every((c) => c.ok);
}

export function isGoogleSheetsReady(): boolean {
  const checks = getSetupChecks();
  return (
    checks.find((c) => c.id === "google_sa_email")?.ok === true &&
    checks.find((c) => c.id === "google_sa_key")?.ok === true
  );
}

/** 共有に使うサービスアカウントメール（UI 表示用） */
export function getServiceAccountEmailForSharing(): string | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  return email || null;
}

export const TEST_SPREADSHEET_URLS = {
  booking: `https://docs.google.com/spreadsheets/d/${FORM_SOURCES.booking.spreadsheetId}/edit`,
  request: `https://docs.google.com/spreadsheets/d/${FORM_SOURCES.request.spreadsheetId}/edit`,
} as const;
