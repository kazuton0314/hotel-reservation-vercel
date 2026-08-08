import type { OccEvent } from "@/lib/services/room-occupancy";
import { formatGuestCompact } from "@/lib/utils/guest-display";

export function formatOccNightLabel(ev: {
  nightNumber?: number;
  nightsTotal?: number;
  isCheckout?: boolean;
}): string {
  if (!ev?.nightNumber) return "";
  if (ev.isCheckout) return "";
  const total = ev.nightsTotal;
  const n = ev.nightNumber;
  if (total && total > 0) {
    return `${Math.min(n, total)}/${total}泊`;
  }
  return `${n}泊目`;
}

function normalizeBbqMasterValue(bbq: string | null | undefined): string {
  const v = String(bbq ?? "").trim();
  if (v === "持込" || v === "持参") return "持参する";
  return v;
}

function normalizeBbqValue(bbq: string | null | undefined): string {
  const v = normalizeBbqMasterValue(bbq);
  if (!v || v === "未確認") return "";
  return v;
}

/** GAS formatBbqDisplayLabel_ 相当（メール差し込み用） */
export function formatBbqDisplayLabel(bbq: string | null | undefined): string {
  const v = normalizeBbqValue(bbq);
  if (v === "要") return "BBQ要";
  if (v === "持参する") return "BBQ持込";
  if (v === "不要") return "BBQ不要";
  return v;
}

export function formatBbqBadgeLabel(bbq: string | null | undefined): string | null {
  const v = normalizeBbqValue(bbq);
  if (v === "要") return "BBQ要";
  if (v === "持参する") return "BBQ持込";
  return null;
}

/** 部屋割カード: 宿泊人数（予約合計）+ その部屋の人数内訳 */
export function formatOccGuestMeta(ev: OccEvent): string {
  return formatGuestCompact({
    guest_total: ev.guestTotal,
    adult_male: ev.adultMale,
    adult_female: ev.adultFemale,
    boy_student: ev.boyStudent,
    girl_student: ev.girlStudent,
    age_3plus: ev.age3plus,
    under_3: ev.under3,
  });
}

export function eventClassName(ev: OccEvent, isShared: boolean): string {
  const parts = ["occ-event"];
  if (isShared) parts.push("occ-shared");
  if (ev.isUnassigned) parts.push("occ-unassigned");
  if (ev.isStay) parts.push("occ-stay");
  if (ev.isCheckin && ev.isCheckout) parts.push("occ-turn");
  else if (ev.isCheckin) parts.push("occ-checkin");
  else if (ev.isCheckout) parts.push("occ-checkout");
  if (ev.status === "仮予約") parts.push("occ-provisional");
  if (ev.isDraft) parts.push("occ-draft");
  return parts.join(" ");
}
