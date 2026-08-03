"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PendingLink } from "@/components/ui/PendingLink";
import { RefreshButton } from "@/components/RefreshButton";
import { SettingsMenu } from "@/components/SettingsMenu";
import { signOutAction } from "@/lib/actions/auth";
import {
  defaultHrefForSection,
  getSectionRememberedHref,
  markHomeIntent,
  type NavSection,
} from "@/lib/nav/session-memory";

export type NavView =
  | "dashboard"
  | "rooms"
  | "calendar"
  | "request"
  | "list"
  | "customers";

const NAV: {
  view: NavView;
  section: NavSection;
  icon: string;
  label: string;
}[] = [
  { view: "dashboard", section: "home", icon: "◉", label: "ホーム" },
  { view: "rooms", section: "rooms", icon: "▦", label: "部屋割" },
  { view: "calendar", section: "calendar", icon: "◫", label: "予定" },
  { view: "request", section: "requests", icon: "✉", label: "リクエスト" },
  { view: "list", section: "reservations", icon: "☰", label: "本予約" },
  { view: "customers", section: "customers", icon: "⌕", label: "顧客" },
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

function BottomNav({ activeView }: { activeView: NavView | null }) {
  const [hrefs, setHrefs] = useState<Record<NavSection, string>>(() => ({
    home: "/",
    rooms: "/rooms",
    calendar: "/calendar",
    requests: "/requests",
    reservations: "/reservations",
    customers: "/customers",
    settings: "/settings",
  }));

  useEffect(() => {
    setHrefs({
      home: defaultHrefForSection("home"),
      rooms: getSectionRememberedHref("rooms"),
      calendar: getSectionRememberedHref("calendar"),
      requests: getSectionRememberedHref("requests"),
      reservations: getSectionRememberedHref("reservations"),
      customers: getSectionRememberedHref("customers"),
      settings: getSectionRememberedHref("settings"),
    });
  }, [activeView]);

  return (
    <nav className="nav" id="bottom-nav">
      {NAV.map((item) => (
        <PendingLink
          key={item.view}
          href={hrefs[item.section]}
          prefetch
          className={`nav-btn${activeView === item.view ? " active" : ""}`}
          onClick={() => {
            if (item.section === "home") markHomeIntent();
          }}
        >
          <span className="ni">{item.icon}</span>
          {item.label}
        </PendingLink>
      ))}
    </nav>
  );
}

export function AppShell({
  children,
  title = "ホーム",
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
            <RefreshButton />
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

      {!hideNav ? <BottomNav activeView={activeView} /> : null}
    </>
  );
}
