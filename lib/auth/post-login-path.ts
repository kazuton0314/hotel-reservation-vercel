/**
 * ログイン後の戻り先。
 * 一覧ルートへ戻すとスマホで「毎回本予約が開く」ように見えるため、ホームへ寄せる。
 * 詳細・新規作成などのディープリンクは維持する。
 */
const LIST_ROOTS = new Set([
  "/reservations",
  "/requests",
  "/rooms",
  "/calendar",
  "/customers",
  "/settings",
  "/mail",
  "/login",
]);

export function resolvePostLoginPath(rawNext: string | null | undefined): string {
  const next = (rawNext ?? "/").trim() || "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";

  const qIndex = next.indexOf("?");
  const pathOnly = (qIndex >= 0 ? next.slice(0, qIndex) : next) || "/";
  const query = qIndex >= 0 ? next.slice(qIndex) : "";

  const segments = pathOnly.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return pathOnly + query;
  }

  const root = segments.length === 0 ? "/" : `/${segments[0]}`;
  if (root === "/" || LIST_ROOTS.has(root)) {
    return "/";
  }

  return pathOnly + query;
}
