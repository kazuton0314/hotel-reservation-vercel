/** アプリの公開ベース URL を解決（末尾スラッシュなし） */
export function resolveAppBaseUrl(explicitBase?: string | null): string {
  const candidates = [
    explicitBase,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    process.env.NODE_ENV === "development" ? "http://localhost:3000" : "",
  ];

  for (const raw of candidates) {
    let value = String(raw ?? "").trim().replace(/\/$/, "");
    if (!value) continue;
    if (!/^https?:\/\//i.test(value)) {
      value = `https://${value}`;
    }
    return value;
  }
  return "";
}

/** 予約ごとの同行者入力URL（access_key で本人確認） */
export function buildCompanionFormUrl(
  accessKey: string | null | undefined,
  baseUrl?: string | null
): string {
  const key = String(accessKey ?? "").trim();
  if (!key) return "";

  const base = resolveAppBaseUrl(baseUrl);
  if (!base) return "";

  return `${base}/companions/${encodeURIComponent(key)}`;
}
