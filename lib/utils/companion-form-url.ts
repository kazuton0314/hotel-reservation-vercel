/** Vercel 付与ドメイン（ゲスト向けリンクには使わない） */
export function isDeploymentPlatformHost(hostOrUrl: string): boolean {
  try {
    const host = hostOrUrl.includes("://")
      ? new URL(hostOrUrl).hostname
      : hostOrUrl.split("/")[0]?.split(":")[0] ?? "";
    const h = host.toLowerCase();
    return (
      h.endsWith(".vercel.app") ||
      h.endsWith(".vercel.sh") ||
      h === "vercel.app"
    );
  } catch {
    return false;
  }
}

function normalizeBaseUrl(raw: string | null | undefined): string {
  let value = String(raw ?? "").trim().replace(/\/$/, "");
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  if (isDeploymentPlatformHost(value)) return "";
  return value;
}

/** 内部用（Vercel フォールバック含む） */
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
    const value = normalizeBaseUrl(raw);
    if (value) return value;
  }
  return "";
}

/**
 * ゲスト向けリンク用（同行者フォーム等）。
 * NEXT_PUBLIC_APP_URL を最優先し、Vercel 付与ドメイン (*.vercel.app) にはフォールバックしない。
 */
export function resolveGuestAppBaseUrl(
  explicitBase?: string | null,
  requestHostBase?: string | null
): string {
  const candidates = [
    explicitBase,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    requestHostBase,
    process.env.NODE_ENV === "development" ? "http://localhost:3000" : "",
  ];

  for (const raw of candidates) {
    const value = normalizeBaseUrl(raw);
    if (value) return value;
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

  const base = resolveGuestAppBaseUrl(baseUrl);
  if (!base) return "";

  return `${base}/companions/${encodeURIComponent(key)}`;
}
