"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "mr_theme_v1";

function readSavedTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(KEY) as Theme | null;
  return saved === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(KEY, theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => readSavedTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onToggle = () => {
      setTheme((prev) => (prev === "light" ? "dark" : "light"));
    };
    window.addEventListener("mr-toggle-theme", onToggle);
    return () => window.removeEventListener("mr-toggle-theme", onToggle);
  }, []);

  return <>{children}</>;
}
