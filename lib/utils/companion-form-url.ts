/** 予約ごとの同行者入力URL（access_key で本人確認） */
export function buildCompanionFormUrl(accessKey: string | null | undefined): string {
  const key = String(accessKey ?? "").trim();
  if (!key) return "";

  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`
    : "";
  const devDefault =
    process.env.NODE_ENV === "development" ? "http://localhost:3000" : "";
  const base = explicit || vercel || devDefault;
  if (!base) return "";

  return `${base}/companions/${encodeURIComponent(key)}`;
}
