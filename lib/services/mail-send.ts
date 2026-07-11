import { Resend } from "resend";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

export type SendMailInput = {
  to: string;
  subject: string;
  body: string;
  entityType: string;
  entityId: string;
  templateId?: string;
};

export type SendMailResult =
  | {
      ok: true;
      providerId: string | null;
      provider: "smtp" | "resend";
      sentCopyError?: string;
    }
  | { ok: false; message: string; skipped?: boolean };

export type MailProvider = "smtp" | "resend";

function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim();
}

/** 差出人ヘッダー（MAIL_FROM 優先。SMTP_USER とは別アドレスにできる） */
export function resolveMailFromHeader(): string {
  const explicit = process.env.MAIL_FROM?.trim();
  if (explicit) return explicit;

  const address = process.env.MAIL_FROM_ADDRESS?.trim();
  const name =
    process.env.MAIL_FROM_NAME?.trim() || process.env.FACILITY_NAME?.trim();
  if (address && name) return `${name} <${address}>`;
  if (address) return address;

  return process.env.SMTP_USER?.trim() || "";
}

export function resolveMailProvider(): MailProvider | null {
  const explicit = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === "smtp") return "smtp";
  if (explicit === "resend") return "resend";
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  return null;
}

function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      resolveMailFromHeader()
  );
}

type ImapSentSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  sentMailbox?: string;
};

function imapSentSettings(): ImapSentSettings | null {
  if (process.env.IMAP_SAVE_SENT === "false") return null;

  const host = process.env.IMAP_HOST?.trim() || process.env.SMTP_HOST?.trim();
  const user = process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim();
  const pass = process.env.IMAP_PASS?.trim() || process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) return null;

  const port = Number(process.env.IMAP_PORT ?? 993);
  return {
    host,
    port,
    secure: process.env.IMAP_SECURE
      ? process.env.IMAP_SECURE === "true"
      : port === 993,
    user,
    pass,
    sentMailbox:
      process.env.IMAP_SENT_MAILBOX?.trim() ||
      process.env.MAIL_SENT_MAILBOX?.trim() ||
      undefined,
  };
}

function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function formatAddressHeader(value: string): string {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!m) return value;
  const displayName = m[1].replace(/^"|"$/g, "").trim();
  const address = m[2].trim();
  return displayName ? `${encodeHeaderValue(displayName)} <${address}>` : address;
}

function wrapBase64(value: string): string {
  return value.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function buildRawSentMessage(input: SendMailInput, from: string, messageId: string | null) {
  const rawHeaders = [
    `From: ${formatAddressHeader(from)}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    messageId ? `Message-ID: ${messageId}` : null,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean);

  return `${rawHeaders.join("\r\n")}\r\n\r\n${wrapBase64(
    Buffer.from(input.body, "utf8").toString("base64")
  )}\r\n`;
}

function uniqueCandidates(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function appendSmtpMailToSent(
  input: SendMailInput,
  from: string,
  messageId: string | null
): Promise<string | null> {
  const settings = imapSentSettings();
  if (!settings) return null;

  const client = new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: {
      user: settings.user,
      pass: settings.pass,
    },
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    const sentBySpecialUse = mailboxes.find(
      (m) => String(m.specialUse ?? "").toLowerCase() === "\\sent"
    )?.path;
    const sentByName = mailboxes.find((m) =>
      /(^|[./])(sent|sent items|sent messages|送信済み?)([./]|$)/i.test(m.path)
    )?.path;
    const candidates = uniqueCandidates([
      settings.sentMailbox,
      sentBySpecialUse,
      sentByName,
      "Sent",
      "Sent Items",
      "Sent Messages",
      "送信済み",
    ]);
    const raw = buildRawSentMessage(input, from, messageId);
    let lastError: unknown = null;

    for (const mailbox of candidates) {
      try {
        await client.append(mailbox, raw, ["\\Seen"], new Date());
        return null;
      } catch (e) {
        lastError = e;
      }
    }

    return `IMAP送信済み保存に失敗しました: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`;
  } catch (e) {
    return `IMAP送信済み保存に失敗しました: ${
      e instanceof Error ? e.message : String(e)
    }`;
  } finally {
    try {
      client.close();
    } catch {
      // Best-effort cleanup only.
    }
  }
}

export async function sendMailViaSmtp(
  input: SendMailInput
): Promise<SendMailResult> {
  if (!smtpConfigured()) {
    return {
      ok: false,
      skipped: true,
      message:
        "SMTP未設定です（SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM を設定してください）。",
    };
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    process.env.SMTP_SECURE === "true" || String(port) === "465";

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const from = resolveMailFromHeader();
    const replyTo =
      process.env.MAIL_REPLY_TO?.trim() ||
      extractEmailAddress(from) ||
      process.env.SMTP_USER?.trim();
    const info = await transporter.sendMail({
      from,
      to: input.to,
      replyTo: replyTo || undefined,
      subject: input.subject,
      text: input.body,
    });
    const sentCopyError = await appendSmtpMailToSent(
      input,
      from,
      info.messageId ?? null
    );
    return {
      ok: true,
      providerId: info.messageId ?? null,
      provider: "smtp",
      sentCopyError: sentCopyError ?? undefined,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function sendMailViaResend(
  input: SendMailInput
): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false,
      skipped: true,
      message:
        "メール送信は未設定です（RESEND_API_KEY / MAIL_FROM を設定してください）。",
    };
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.body,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, providerId: data?.id ?? null, provider: "resend" };
}

/** MAIL_PROVIDER または環境変数から SMTP / Resend を自動選択 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const provider = resolveMailProvider();
  if (provider === "smtp") return sendMailViaSmtp(input);
  if (provider === "resend") return sendMailViaResend(input);
  return {
    ok: false,
    skipped: true,
    message:
      "メール送信は未設定です（SMTP または RESEND_API_KEY を設定してください）。",
  };
}
