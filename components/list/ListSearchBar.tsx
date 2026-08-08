"use client";

import { Input } from "@/components/ui/input";
import { useListSearch } from "@/components/list/ListSearchProvider";

type Props = {
  className?: string;
};

export function ListSearchBar({ className }: Props) {
  const { keyword, setKeyword, checkIn, setCheckIn, clearAll } = useListSearch();
  const hasFilter = Boolean(keyword.trim() || checkIn.trim());

  return (
    <div className={`list-search-bar${className ? ` ${className}` : ""}`}>
      <div
        className={
          hasFilter
            ? "list-search-keyword-wrap list-search-keyword-wrap--clearable"
            : "list-search-keyword-wrap"
        }
      >
        <Input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          className="list-search-keyword"
          placeholder="名前・メール・電話・ID"
          value={keyword}
          autoComplete="off"
          aria-label="キーワード検索"
          onChange={(e) => setKeyword(e.target.value)}
        />
        {hasFilter ? (
          <button
            type="button"
            className="list-search-clear"
            aria-label="検索をクリア"
            onClick={clearAll}
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="list-search-date-wrap date-field-shell">
        <Input
          type="date"
          className="list-search-date date-field-input"
          value={checkIn}
          aria-label="チェックイン日"
          onChange={(e) => setCheckIn(e.target.value)}
        />
      </div>
    </div>
  );
}
