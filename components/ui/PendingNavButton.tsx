"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type Props = {
  href: string;
  value: number;
  label: string;
  title?: string;
  variant?: "status" | "todo";
};

/** ホーム統計など、押下感だけ出す遷移ボタン */
export function PendingNavButton({
  href,
  value,
  label,
  title,
  variant = "status",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const urgent = variant === "todo" && value > 0 ? " stat-todo-urgent" : "";
  const base =
    variant === "todo" ? `stat stat-todo${urgent}` : "stat stat-btn";

  return (
    <Button
      type="button"
      variant="secondary"
      className={cn(base, pending && "is-pressed")}
      title={title}
      aria-busy={pending}
      onClick={() => {
        startTransition(() => {
          router.push(href);
        });
      }}
    >
      <div className="num">{value}</div>
      <div className="label">{label}</div>
    </Button>
  );
}
