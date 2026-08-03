"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type Props = ComponentProps<typeof Link>;

/** 遷移待ちを視覚化する Link（子で useLinkStatus を使う） */
export function PendingLink({ className, children, ...props }: Props) {
  return (
    <Link {...props} className={cn("pending-nav-link", className)}>
      <PendingLinkChrome>{children}</PendingLinkChrome>
    </Link>
  );
}

function PendingLinkChrome({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        className="pending-nav-state"
        data-pending={pending ? "true" : undefined}
        hidden
      />
      {children}
      {pending ? (
        <span className="pending-nav-badge" aria-live="polite">
          開いています…
        </span>
      ) : null}
    </>
  );
}
