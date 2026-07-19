"use client";

import type { ReactNode } from "react";
import { useRememberedScrollArea } from "@/lib/nav/use-remembered-scroll-area";

type Props = {
  top: ReactNode;
  children: ReactNode;
};

/** 一覧設定の外枠。縦スクロールで上段タブを退避でき、表を広く使える */
export function SetupPageShell({ top, children }: Props) {
  const scrollRef = useRememberedScrollArea("setup-page");
  return (
    <div className="setup-page-chrome" ref={scrollRef}>
      <div className="setup-page-chrome-top">{top}</div>
      {children}
    </div>
  );
}
