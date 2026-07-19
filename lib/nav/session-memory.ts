/**
 * 画面復帰・下ナビ記憶用（タブ／PWA セッション単位）
 * - 完全終了後は sessionStorage が消える → ホーム開始でよい
 * - 同一セッション内は URL・スクロール・下ナビ位置を復元
 */

export type NavSection =
  | "home"
  | "rooms"
  | "calendar"
  | "requests"
  | "reservations"
  | "customers"
  | "settings";

const LAST_PATH_KEY = "nav:lastPath";
const SUSPENDED_KEY = "nav:suspended";
const HOME_INTENT_KEY = "nav:homeIntent";
const SECTION_PREFIX = "nav:section:";
const SCROLL_PREFIX = "nav:scroll:";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function resolveNavSection(pathname: string): NavSection | null {
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname === "/") return "home";
  if (pathname.startsWith("/rooms")) return "rooms";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/requests")) return "requests";
  if (pathname.startsWith("/reservations")) return "reservations";
  if (pathname.startsWith("/customers")) return "customers";
  return null;
}

export function defaultHrefForSection(section: NavSection): string {
  switch (section) {
    case "home":
      return "/";
    case "rooms":
      return "/rooms";
    case "calendar":
      return "/calendar";
    case "requests":
      return "/requests";
    case "reservations":
      return "/reservations";
    case "customers":
      return "/customers";
    case "settings":
      return "/settings";
  }
}

/** 一覧・部屋割など「戻り先」になりうるパスか */
export function isSectionRootPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/rooms" ||
    pathname === "/calendar" ||
    pathname === "/requests" ||
    pathname === "/requests/setup" ||
    pathname === "/reservations" ||
    pathname === "/reservations/setup" ||
    pathname === "/customers" ||
    pathname.startsWith("/settings")
  );
}

export function getFullPath(
  pathname: string,
  searchParams?: URLSearchParams | string | null
): string {
  const qs =
    typeof searchParams === "string"
      ? searchParams.replace(/^\?/, "")
      : searchParams
        ? searchParams.toString()
        : "";
  return qs ? `${pathname}?${qs}` : pathname;
}

export function rememberFullPath(fullPath: string): void {
  if (!canUseStorage() || !fullPath) return;
  try {
    sessionStorage.setItem(LAST_PATH_KEY, fullPath);
    const pathname = fullPath.split("?")[0] || fullPath;
    const section = resolveNavSection(pathname);
    if (section && isSectionRootPath(pathname)) {
      sessionStorage.setItem(`${SECTION_PREFIX}${section}`, fullPath);
    }
  } catch {
    /* private mode など */
  }
}

export function getLastFullPath(): string | null {
  if (!canUseStorage()) return null;
  try {
    return sessionStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}

export function getSectionRememberedHref(
  section: NavSection,
  fallback = defaultHrefForSection(section)
): string {
  if (!canUseStorage()) return fallback;
  try {
    return sessionStorage.getItem(`${SECTION_PREFIX}${section}`) || fallback;
  } catch {
    return fallback;
  }
}

export function markHomeIntent(): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(HOME_INTENT_KEY, "1");
    sessionStorage.removeItem(SUSPENDED_KEY);
  } catch {
    /* ignore */
  }
}

export function markSuspended(): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(SUSPENDED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeSoftResumePath(currentFullPath: string): string | null {
  if (!canUseStorage()) return null;
  try {
    const suspended = sessionStorage.getItem(SUSPENDED_KEY) === "1";
    const homeIntent = sessionStorage.getItem(HOME_INTENT_KEY) === "1";
    const last = sessionStorage.getItem(LAST_PATH_KEY);
    sessionStorage.removeItem(SUSPENDED_KEY);
    if (homeIntent) {
      sessionStorage.removeItem(HOME_INTENT_KEY);
      return null;
    }
    if (!suspended || !last || last === currentFullPath) return null;
    // start_url のホームへ戻されたときだけ再開
    if (currentFullPath !== "/" && currentFullPath !== "") return null;
    if (last === "/" || last.startsWith("/?")) return null;
    return last;
  } catch {
    return null;
  }
}

export function saveScrollPosition(
  fullPath: string,
  scroll: { top: number; left?: number; area?: string }
): void {
  if (!canUseStorage() || !fullPath) return;
  try {
    const key = `${SCROLL_PREFIX}${scroll.area ?? "main"}:${fullPath}`;
    sessionStorage.setItem(
      key,
      JSON.stringify({ top: scroll.top, left: scroll.left ?? 0 })
    );
  } catch {
    /* ignore */
  }
}

export function loadScrollPosition(
  fullPath: string,
  area = "main"
): { top: number; left: number } | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(`${SCROLL_PREFIX}${area}:${fullPath}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { top?: number; left?: number };
    return {
      top: Number(parsed.top) || 0,
      left: Number(parsed.left) || 0,
    };
  } catch {
    return null;
  }
}

export function saveJson<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadJson<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function removeStorageKey(key: string): void {
  if (!canUseStorage()) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function setupDraftStorageKey(fullPath: string): string {
  return `setup:draft:${fullPath}`;
}
