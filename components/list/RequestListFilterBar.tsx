"use client";

import { ListSortBar } from "@/components/list/ListSortBar";

export function RequestListFilterBar() {
  return (
    <div className="list-filter-bar">
      <ListSortBar kind="request" />
    </div>
  );
}
