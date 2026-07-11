"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsMenu } from "@/components/SettingsMenu";
import { signOutAction } from "@/lib/actions/auth";

export type NavView =
  | "dashboard"
  | "rooms"
  | "calendar"
  | "request"
  | "list"
  | "customers";

const NAV: { view: NavView; href: string; icon: string; label: string }[] = [
  { view: "dashboard", href: "/", icon: "◉", label: "ホーム" },
  { view: "rooms", href: "/rooms", icon: "▦", label: "部屋割" },
  { view: "calendar", href: "/calendar", icon: "◫", label: "予定" },
  { view: "request", href: "/requests", icon: "✉", label: "リクエスト" },
  { view: "list", href: "/reservations", icon: "☰", label: "本予約" },
  { view: "customers", href: "/customers", icon: "⌕", label: "顧客" },
];

function resolveActiveView(pathname: string): NavView | null {
  if (pathname.startsWith("/settings")) return null;
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/rooms")) return "rooms";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/requests")) return "request";
  if (pathname.startsWith("/reservations")) return "list";
  if (pathname.startsWith("/customers")) return "customers";
  return "dashboard";
}

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  headerDate?: string;
  hideNav?: boolean;
};

export function AppShell({
  children,
  title = "予約管理",
  headerDate,
  hideNav = false,
}: AppShellProps) {
  const pathname = usePathname();
  const activeView = resolveActiveView(pathname);

  useEffect(() => {
    if (hideNav) {
      document.body.classList.add("subview");
    } else {
      document.body.classList.remove("subview");
    }
    return () => document.body.classList.remove("subview");
  }, [hideNav]);

  return (
    <>
      <header className="header">
        <div className="header-top">
          <span className="btn-header-back hidden" aria-hidden />
          <h1 id="page-title">{title}</h1>
          <div className="header-actions">
            <SettingsMenu />
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="secondary"
                className="header-action-btn"
                aria-label="ログアウト"
              >
                <span className="header-action-icon" aria-hidden>
                  ⎋
                </span>
                <span className="header-action-label">ログアウト</span>
              </Button>
            </form>
          </div>
        </div>
        {headerDate ? <p className="header-sub">{headerDate}</p> : null}
      </header>

      <main className="main">{children}</main>

      {!hideNav ? (
        <nav className="nav" id="bottom-nav">
          {NAV.map((item) => (
            <Link
              key={item.view}
              href={item.href}
              prefetch
              className={`nav-btn${activeView === item.view ? " active" : ""}`}
            >
              <span className="ni">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
