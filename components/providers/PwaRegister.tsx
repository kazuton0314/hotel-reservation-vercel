"use client";

import { useEffect } from "react";

/** 最小 Service Worker を登録（PWA インストール用。認証・キャッシュには触れない） */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* 登録失敗はサイレント（ショートカット追加は引き続き可能） */
    });
  }, []);

  return null;
}
