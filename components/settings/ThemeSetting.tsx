"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const KEY = "mr_theme_v1";

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
}

export function ThemeSetting() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div className="settings-pref-row">
      <div>
        <p className="settings-pref-label">テーマ</p>
        <p className="settings-pref-hint">画面の明るさを切り替えます</p>
      </div>
      <div className="settings-segmented">
        <Button
          type="button"
          size="sm"
          variant={theme === "light" ? "default" : "secondary"}
          onClick={() => choose("light")}
        >
          ライト
        </Button>
        <Button
          type="button"
          size="sm"
          variant={theme === "dark" ? "default" : "secondary"}
          onClick={() => choose("dark")}
        >
          ダーク
        </Button>
      </div>
    </div>
  );
}
