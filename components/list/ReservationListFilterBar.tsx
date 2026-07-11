"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListSortBar } from "@/components/list/ListSortBar";
import { Select } from "@/components/ui/input";

export type ListFilterOption = { value: string; label: string };

export type ListFilterFieldDef = {
  key: string;
  label: string;
  options: ListFilterOption[];
};

type ReservationListFilterBarProps = {
  fields: ListFilterFieldDef[];
  activeField?: string;
  activeValue?: string;
};

export function ReservationListFilterBar({
  fields,
  activeField,
  activeValue,
}: ReservationListFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const field = activeField || "";
  const value = activeValue || "";
  const valueOptions =
    fields.find((f) => f.key === field)?.options ?? [];

  function pushParams(nextField: string, nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!nextField || !nextValue) {
      params.delete("filterField");
      params.delete("filterValue");
    } else {
      params.set("filterField", nextField);
      params.set("filterValue", nextValue);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="list-filter-bar">
      <div className="list-toolbar-row list-filter-row">
        <span className="list-toolbar-label">絞り込み</span>
        <Select
          className="list-filter-select"
          value={field}
          onChange={(e) => {
            const nextField = e.target.value;
            if (!nextField) {
              pushParams("", "");
              return;
            }
            const first = fields.find((f) => f.key === nextField)?.options[0];
            pushParams(nextField, first?.value ?? "");
          }}
        >
          <option value="">なし</option>
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </Select>
        <Select
          className="list-filter-select"
          value={value}
          disabled={!field}
          onChange={(e) => pushParams(field, e.target.value)}
        >
          {valueOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
      <ListSortBar kind="reservation" />
    </div>
  );
}
