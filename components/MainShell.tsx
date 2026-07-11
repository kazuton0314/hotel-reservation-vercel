"use client";

import { AppShell } from "@/components/AppShell";
import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/": "予約管理",
  "/rooms": "部屋割り",
  "/calendar": "予定",
  "/requests": "リクエスト",
  "/reservations": "本予約",
  "/customers": "顧客",
  "/settings/setup": "セットアップ",
  "/settings": "設定",
  "/settings/sync": "フォーム同期",
  "/settings/mail": "メール定型文",
  "/settings/operations": "運用コンソール",
  "/settings/preferences": "表示と通知",
};

export function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title =
    Object.entries(TITLES)
      .sort(([a], [b]) => b.length - a.length)
      .find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ??
    "予約管理";

  return <AppShell title={title}>{children}</AppShell>;
}
