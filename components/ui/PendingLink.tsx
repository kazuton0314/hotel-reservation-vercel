"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

type Props = ComponentProps<typeof Link>;

/** 遷移中も押下感だけ出す Link（文言は出さない） */
export function PendingLink({ className, children, ...props }: Props) {
  return (
    <Link {...props} className={cn("pending-nav-link", className)}>
      <PendingLinkState />
      {children}
    </Link>
  );
}

function PendingLinkState() {
  const { pending } = useLinkStatus();
  return (
    <span
      className="pending-nav-state"
      data-pending={pending ? "true" : undefined}
      hidden
    />
  );
}
