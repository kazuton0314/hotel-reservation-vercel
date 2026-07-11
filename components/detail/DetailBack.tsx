"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  href?: string;
  label?: string;
};

export function DetailBack({ href, label = "← 戻る" }: Props) {
  const router = useRouter();

  return (
    <div className="detail-back">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          if (href) router.push(href);
          else router.back();
        }}
      >
        {label}
      </Button>
    </div>
  );
}
