"use client";

import type { ReactNode } from "react";
import { useRememberedScrollArea } from "@/lib/nav/use-remembered-scroll-area";

type Props = {
  /** これから／タブ／検索など。中央寄せ（一覧と同じ幅）で、縦スクロールで退避する */
  top?: ReactNode;
  children: ReactNode;
};

/** 一覧設定の外枠。縦スクロールで上段を退避でき、表は幅いっぱいに使える */
export function SetupPageShell({ top, children }: Props) {
  const scrollRef = useRememberedScrollArea("setup-page");
  return (
    <div className="setup-page-chrome" ref={scrollRef}>
      {top ? <div className="setup-page-chrome-top">{top}</div> : null}
      {children}
    </div>
  );
}
