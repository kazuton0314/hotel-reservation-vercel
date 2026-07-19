"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getFullPath,
  loadScrollPosition,
  saveScrollPosition,
} from "@/lib/nav/session-memory";

/** 一覧設定テーブルなど、ウィンドウ以外のスクロール領域を復元 */
export function useRememberedScrollArea(area: string) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullPath = getFullPath(pathname, searchParams);
  const ref = useRef<HTMLDivElement>(null);
  const skipSave = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = loadScrollPosition(fullPath, area);
    if (!saved) return;
    skipSave.current = true;
    el.scrollTop = saved.top;
    el.scrollLeft = saved.left;
    const t = window.setTimeout(() => {
      skipSave.current = false;
    }, 120);
    return () => window.clearTimeout(t);
  }, [fullPath, area]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const persist = () => {
      if (skipSave.current) return;
      saveScrollPosition(fullPath, {
        top: el.scrollTop,
        left: el.scrollLeft,
        area,
      });
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        persist();
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      persist();
    };
  }, [fullPath, area]);

  return ref;
}
