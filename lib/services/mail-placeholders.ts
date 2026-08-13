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
  /** 大人男性5・大人女性2… 形式。本予約のみ */
  guestBreakdown?: string;
  bbq?: string;
  somen?: string;
  studioBookingUrl?: string;
  companionFormUrl?: string;
  rejectReason?: string;
  mailFrom?: string;
};

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
    人数内訳: ctx.guestBreakdown ?? "",
    BBQ利用予定: ctx.bbq ?? "",
    流しそうめんレンタル: ctx.somen ?? "",
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

/**
 * 差し込みチップの表示。
 * - request → 一般＋リクエストフォーム由来
 * - reservation → 一般＋本予約フォーム由来（同行者リンク含む）
 * - それ以外（テンプレ編集の「一般」など）→ 一般のみ
 */
export function filterVariablesForEntity(
  entityType: string,
  mailKind?: string
): typeof MAIL_TEMPLATE_META.variables {
  void mailKind;
  if (entityType === "request") {
    return MAIL_TEMPLATE_META.variables.filter(
      (v) =>
        v.categories.includes("一般") || v.categories.includes("リクエスト")
    );
  }
  if (entityType === "reservation") {
    return MAIL_TEMPLATE_META.variables.filter(
      (v) =>
        v.categories.includes("一般") || v.categories.includes("本予約")
    );
  }
  return MAIL_TEMPLATE_META.variables.filter((v) =>
    v.categories.includes("一般")
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
    // 「一般」は旧「共通」相当で両エンティティから選べる
    if (t.category === "一般") return true;
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
