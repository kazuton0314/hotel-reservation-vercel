"use client";

import { AppShell } from "@/components/AppShell";
import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/": "ホーム",
  "/rooms": "部屋割り",
  "/calendar": "予定",
  "/requests/setup": "リクエスト一覧設定",
  "/requests": "リクエスト",
  "/reservations/setup": "本予約一覧設定",
  "/reservations": "本予約",
  "/customers": "顧客",
  "/settings/setup": "セットアップ",
  "/settings": "設定",
  "/settings/sync": "フォーム同期",
  "/settings/mail": "メール定型文",
  "/settings/operations": "運用コンソール",
  "/settings/preferences": "表示と通知",
};

function resolveTitle(pathname: string): string {
  if (pathname === "/") return "ホーム";
  const match = Object.entries(TITLES)
    .filter(([path]) => path !== "/")
    .sort(([a], [b]) => b.length - a.length)
    .find(
      ([path]) => pathname === path || pathname.startsWith(`${path}/`)
    );
  return match?.[1] ?? "ホーム";
}

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <AppShell title={resolveTitle(pathname)}>{children}</AppShell>;
}
