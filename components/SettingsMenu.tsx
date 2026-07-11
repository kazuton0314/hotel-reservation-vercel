"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const SETTINGS_GROUPS = [
  {
    label: "日常運用",
    items: [
      { href: "/settings/sync", label: "フォーム同期" },
      { href: "/settings/operations", label: "運用コンソール" },
    ],
  },
  {
    label: "コンテンツ",
    items: [{ href: "/settings/mail", label: "メール定型文" }],
  },
  {
    label: "システム",
    items: [{ href: "/settings/setup", label: "セットアップ" }],
  },
] as const;

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="header-settings-menu" ref={rootRef}>
      <Button
        type="button"
        variant="secondary"
        className="header-action-btn"
        aria-label="設定"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="header-action-icon" aria-hidden>
          ⚙
        </span>
        <span className="header-action-label">設定</span>
      </Button>
      {open ? (
        <div className="header-settings-panel" role="menu">
          <Link
            href="/settings"
            className="header-settings-home"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            設定トップ
          </Link>
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label} className="header-settings-group">
              <p className="header-settings-group-label">{group.label}</p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="header-settings-item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <span className="header-settings-item-label">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
