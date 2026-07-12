import type { MailTemplate } from "@/lib/config/mail-templates";
import { MAIL_TEMPLATE_META } from "@/lib/config/mail-templates";
import { normalizeMergeText } from "@/lib/services/mail-merge";

export type MailEntityContext = {
  representativeName?: string;
  lastName?: string;
  firstName?: string;
  nameKana?: string;
  email?: string;
  phone?: string;
  facilityName?: string;
  reservationId?: string;
  requestId?: string;
  checkIn?: string;
  checkOut?: string;
  arrivalTime?: string;
  nights?: string;
  guestTotal?: string;
  bbq?: string;
  studioBookingUrl?: string;
  companionFormUrl?: string;
  rejectReason?: string;
  mailFrom?: string;
};

const TOKEN_KEYS = MAIL_TEMPLATE_META.variables.map((v) => v.token);

/** GAS buildMailVariableMap_ と同じキー名（{{}} なし） */
export function buildVariableMap(ctx: MailEntityContext): Record<string, string> {
  return {
    代表者名: ctx.representativeName ?? "",
    姓: ctx.lastName ?? "",
    名: ctx.firstName ?? "",
    ふりがな: ctx.nameKana ?? "",
    メール: ctx.email ?? "",
    電話: ctx.phone ?? "",
    チェックイン: ctx.checkIn ?? "",
    チェックイン予定時間: ctx.arrivalTime ?? "未設定",
    チェックアウト: ctx.checkOut ?? "",
    泊数: ctx.nights ?? "",
    人数: ctx.guestTotal ?? "",
    BBQ利用予定: ctx.bbq ?? "",
    本予約URL: ctx.studioBookingUrl ?? "",
    同行者フォームURL: ctx.companionFormUrl ?? "",
    却下理由: ctx.rejectReason ?? "",
    予約ID: ctx.reservationId ?? "",
    リクエストID: ctx.requestId ?? "",
    施設名: ctx.facilityName ?? "みどりの時計台",
    送信元メール: ctx.mailFrom ?? "",
  };
}

/** 後方互換: {{token}} 形式のマップ */
export function buildPlaceholderMap(ctx: MailEntityContext): Record<string, string> {
  const vars = buildVariableMap(ctx);
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    map[`{{${key}}}`] = value;
  }
  return map;
}

export function substituteMailPlaceholders(
  text: string,
  ctx: MailEntityContext
): string {
  const variables = buildVariableMap(ctx);
  const normalized = normalizeMergeText(text);
  return normalized.replace(/⟦([^⟧]+)⟧|\{\{([^}]+)\}\}/g, (_m, k1, k2) => {
    const k = String(k1 ?? k2 ?? "").trim();
    return variables[k] != null ? String(variables[k]) : "";
  });
}

export function listUnresolvedPlaceholders(
  text: string,
  ctx?: MailEntityContext
): string[] {
  const normalized = normalizeMergeText(text);
  const variables = ctx ? buildVariableMap(ctx) : null;
  const found = new Set<string>();
  const re = /⟦([^⟧]+)⟧|\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const key = String(m[1] ?? m[2] ?? "").trim();
    const token = m[1] ? `⟦${key}⟧` : `{{${key}}}`;
    if (!variables) {
      found.add(token);
      continue;
    }
    if (!(key in variables) || String(variables[key] ?? "").trim() === "") {
      found.add(token);
    }
  }
  return [...found];
}

export function filterVariablesForEntity(
  entityType: string,
  mailKind?: string
): typeof MAIL_TEMPLATE_META.variables {
  const category =
    entityType === "request"
      ? "リクエスト"
      : entityType === "reservation"
        ? "本予約"
        : "共通";

  return MAIL_TEMPLATE_META.variables.filter(
    (v) => v.categories.includes("共通") || v.categories.includes(category)
  );
}

export function filterTemplatesForCompose(
  templates: MailTemplate[],
  entityType: string,
  mailKind?: string
) {
  const category =
    entityType === "request"
      ? "リクエスト"
      : entityType === "reservation"
        ? "本予約"
        : null;

  return templates.filter((t) => {
    if (!t.active) return false;
    if (!category) return true;
    if (t.category === "共通") return true;
    if (t.category !== category) return false;
    if (mailKind && t.defaultPurpose && t.defaultPurpose !== mailKind) {
      return false;
    }
    if (
      mailKind &&
      !t.defaultPurpose &&
      ["予約確定", "11日前", "3日前"].includes(mailKind)
    ) {
      return false;
    }
    return true;
  });
}
