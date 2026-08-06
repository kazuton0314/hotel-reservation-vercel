"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  href?: string;
  label?: string;
  /**
   * true のとき history.back() を優先（一覧の検索クエリ・スクロール記憶と一致）。
   * 直接 URL を開いた場合など履歴が弱いときは href へフォールバック。
   */
  preferHistoryBack?: boolean;
};

export function DetailBack({
  href,
  label = "← 戻る",
  preferHistoryBack = false,
}: Props) {
  const router = useRouter();

  return (
    <div className="detail-back">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          if (preferHistoryBack) {
            // App Router のクライアント遷移では document.referrer が更新されないため、
            // 通常は back()。履歴が無い直開きだけ記憶 URL（href）へ。
            if (typeof window !== "undefined" && window.history.length <= 1 && href) {
              router.push(href);
              return;
            }
            router.back();
            return;
          }
          if (href) {
            router.push(href);
            return;
          }
          router.back();
        }}
      >
        {label}
      </Button>
    </div>
  );
}
