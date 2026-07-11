"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  defaultDirForSortField,
  listSortDirIcon,
  listSortDirLabel,
  parseListSort,
  type ListSortField,
} from "@/lib/utils/list-sort";
import { Button } from "@/components/ui/button";

type ListSortBarProps = {
  kind: "request" | "reservation";
};

export function ListSortBar({ kind }: ListSortBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = parseListSort(
    searchParams.get("sort"),
    searchParams.get("dir")
  );

  function pushSort(field: ListSortField, dir?: "asc" | "desc") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", field);
    params.set("dir", dir ?? defaultDirForSortField(field));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className="list-toolbar-row list-sort-toolbar"
      data-sort-kind={kind}
    >
      <span className="list-toolbar-label">並び替え</span>
      <div className="list-sort-segments" role="group" aria-label="並び替えの基準">
        <Button
          type="button"
          variant="secondary"
          className={`list-sort-seg${sort.field === "stay" ? " active" : ""}`}
          onClick={() => pushSort("stay")}
        >
          滞在日
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={`list-sort-seg${sort.field === "received" ? " active" : ""}`}
          onClick={() => pushSort("received")}
        >
          受付日
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={`list-sort-seg${sort.field === "updated" ? " active" : ""}`}
          onClick={() => pushSort("updated")}
        >
          更新日
        </Button>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="list-sort-dir"
        aria-label="並び順を切り替え"
        onClick={() =>
          pushSort(sort.field, sort.dir === "asc" ? "desc" : "asc")
        }
      >
        <span className="list-sort-dir-icon" aria-hidden="true">
          {listSortDirIcon(sort)}
        </span>
        <span className="list-sort-dir-label">{listSortDirLabel(sort)}</span>
      </Button>
    </div>
  );
}
