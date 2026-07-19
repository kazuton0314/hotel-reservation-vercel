"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  consumeSoftResumePath,
  getFullPath,
  loadScrollPosition,
  markSuspended,
  rememberFullPath,
  saveScrollPosition,
} from "@/lib/nav/session-memory";

/**
 * - 現在パスを session に記憶（下ナビ復元用）
 * - スクロール位置の保存／復元
 * - バックグラウンド復帰で start_url に飛ばされたときのソフト再開
 */
export function NavigationMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const fullPath = getFullPath(pathname, searchParams);
  const fullPathRef = useRef(fullPath);
  fullPathRef.current = fullPath;
  const skipScrollSave = useRef(false);

  // パス記憶 + ソフト再開
  useEffect(() => {
    const resume = consumeSoftResumePath(fullPath);
    if (resume) {
      skipScrollSave.current = true;
      router.replace(resume);
      return;
    }
    rememberFullPath(fullPath);
  }, [fullPath, router]);

  // スクロール復元（main の window）
  useEffect(() => {
    const saved = loadScrollPosition(fullPath, "window");
    if (!saved) return;
    skipScrollSave.current = true;
    const id = window.requestAnimationFrame(() => {
      window.scrollTo(saved.left, saved.top);
      window.setTimeout(() => {
        skipScrollSave.current = false;
      }, 100);
    });
    return () => window.cancelAnimationFrame(id);
  }, [fullPath]);

  // スクロール保存
  useEffect(() => {
    let ticking = false;
    const persist = () => {
      if (skipScrollSave.current) return;
      saveScrollPosition(fullPathRef.current, {
        top: window.scrollY,
        left: window.scrollX,
        area: "window",
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
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      persist();
    };
  }, [fullPath]);

  // バックグラウンドへ
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        rememberFullPath(fullPathRef.current);
        markSuspended();
        saveScrollPosition(fullPathRef.current, {
          top: window.scrollY,
          left: window.scrollX,
          area: "window",
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
    };
  }, []);

  return null;
}
