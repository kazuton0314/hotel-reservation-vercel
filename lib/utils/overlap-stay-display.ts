import type { OverlapStayItem } from "@/lib/queries/overlapping-stays";

export type OverlapStayKind = "checkin" | "checkout" | "stay";

export function classifyOverlapStay(
  stay: OverlapStayItem,
  anchorCheckIn: string
): OverlapStayKind {
  const ci = String(stay.check_in ?? "").slice(0, 10);
  const co = String(stay.check_out ?? "").slice(0, 10);
  const anchor = anchorCheckIn.slice(0, 10);

  if (ci === anchor) return "checkin";
  if (co === anchor) return "checkout";
  return "stay";
}

export const OVERLAP_STAY_KIND_LABEL: Record<OverlapStayKind, string> = {
  checkin: "チェックイン",
  stay: "滞在中",
  checkout: "チェックアウト",
};

/** ホーム／予定日／同期間他組と同じ: チェックイン → 滞在中 → チェックアウト */
export const OVERLAP_STAY_KIND_ORDER = [
  "checkin",
  "stay",
  "checkout",
] as const satisfies readonly OverlapStayKind[];

export function groupOverlapStays(
  stays: OverlapStayItem[],
  anchorCheckIn: string
): { kind: OverlapStayKind; label: string; stays: OverlapStayItem[] }[] {
  const groups: Record<OverlapStayKind, OverlapStayItem[]> = {
    checkin: [],
    stay: [],
    checkout: [],
  };

  for (const stay of stays) {
    groups[classifyOverlapStay(stay, anchorCheckIn)].push(stay);
  }

  return OVERLAP_STAY_KIND_ORDER.filter((kind) => groups[kind].length > 0).map(
    (kind) => ({
      kind,
      label: OVERLAP_STAY_KIND_LABEL[kind],
      stays: groups[kind],
    })
  );
}
