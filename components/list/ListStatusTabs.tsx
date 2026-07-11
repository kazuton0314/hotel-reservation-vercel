"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Tab = {
  id: string;
  label: string;
  paramKey: string;
  paramValue: string;
  emphasis?: "primary" | "default";
};

type ListStatusTabsProps = {
  tabs: Tab[];
  activeId: string;
  className?: string;
};

function buildHref(
  pathname: string,
  searchParams: URLSearchParams,
  tab: Tab
) {
  const params = new URLSearchParams(searchParams.toString());
  params.set(tab.paramKey, tab.paramValue);
  params.delete("page");
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function ListStatusTabs({
  tabs,
  activeId,
  className = "tabs tabs-3",
}: ListStatusTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className={className} role="tablist" aria-label="ステータス" data-ui="segmented-tabs">
      {tabs.map((tab) => {
        const active = activeId === tab.id;
        const emphasis = tab.emphasis ?? "default";
        return (
          <Link
            key={tab.id}
            href={buildHref(pathname, searchParams, tab)}
            prefetch
            role="tab"
            aria-selected={active}
            className={[
              "tab",
              active ? "active" : "",
              emphasis === "primary" ? "tab-emphasis" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
