"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ListScope } from "@/lib/utils/list-scope";

export type { ListScope };

type Props = {
  kind: "reservation" | "request";
  scope: ListScope;
};

export function ListScopeBar({ kind, scope }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function href(nextScope: ListScope) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextScope === "archive") params.set("scope", "archive");
    else params.delete("scope");
    params.delete("page");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="list-scope-bar" data-kind={kind} role="group" aria-label="表示範囲">
      <Link
        href={href("upcoming")}
        prefetch
        className={`list-scope-btn${scope === "upcoming" ? " active" : ""}`}
      >
        これから
      </Link>
      <Link
        href={href("archive")}
        prefetch
        className={`list-scope-btn${scope === "archive" ? " active" : ""}`}
      >
        アーカイブ
      </Link>
    </div>
  );
}
