"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** サーバーコンポーネントのデータを再取得（キャッシュ bust） */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      className="header-action-btn"
      disabled={pending}
      aria-label="再読み込み"
      title="再読み込み"
      onClick={() => startTransition(() => router.refresh())}
    >
      <span className="header-action-icon" aria-hidden>
        {pending ? "…" : "↻"}
      </span>
      <span className="header-action-label">再読み込み</span>
    </Button>
  );
}
