import type { OccGuestFields } from "@/lib/services/room-occupancy";
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

/** 受付チャネルが Airbnb のときだけバッジ用ラベルを返す */
export function formatChannelBadgeLabel(
  channel: string | null | undefined
): string | null {
  const v = String(channel ?? "").trim();
  if (!v) return null;
  if (v.toLowerCase() === "airbnb") return "Airbnb";
  return null;
}

/**
 * 部屋割カード: 宿泊人数（予約合計）+ カッコ内はその部屋の人数内訳のみ。
 * 内訳が無い（全部0/未設定）ときは合計のみ。予約内訳はカッコに出さない。
 */
export function formatOccGuestMeta(ev: OccGuestFields): string {
  const roomBreakdownSum =
    (Number(ev.adultMale) || 0) +
    (Number(ev.adultFemale) || 0) +
    (Number(ev.boyStudent) || 0) +
    (Number(ev.girlStudent) || 0) +
    (Number(ev.age3plus) || 0) +
    (Number(ev.under3) || 0);

  if (roomBreakdownSum <= 0) {
    // 部屋内訳が無いときは予約合計（または部屋の guestCount）だけ
    return formatGuestCompact({
      guest_total: ev.guestTotal ?? (ev.guestCount ? String(ev.guestCount) : null),
    });
  }

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

export function eventClassName(
  ev: OccGuestFields & {
    isUnassigned?: boolean;
    isStay?: boolean;
    isCheckin?: boolean;
    isCheckout?: boolean;
    status?: string;
    isDraft?: boolean;
  },
  isShared: boolean
): string {
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
