import { todayIso } from "@/lib/utils/date-label";

export type ListScope = "upcoming" | "archive";

/** URL の scope パラメータを正規化（旧 past も archive 扱い） */
export function parseListScope(raw: string | undefined): ListScope {
  if (raw === "archive" || raw === "past") return "archive";
  return "upcoming";
}

export function listScopeLabel(scope: ListScope): string {
  return scope === "archive" ? "アーカイブ" : "これから";
}

/** カレンダー・部屋割: 表示期間に過去日が含まれる場合はアーカイブ済みも取得 */
export function includeArchivedForDateRange(from: string): boolean {
  const today = todayIso();
  return from < today;
}
