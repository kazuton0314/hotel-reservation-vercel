"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useListSearch } from "@/components/list/ListSearchProvider";

type Props = {
  className?: string;
};

export function ListSearchBar({ className }: Props) {
  const { keyword, setKeyword, checkIn, setCheckIn, clearAll } = useListSearch();
  const hasFilter = Boolean(keyword.trim() || checkIn.trim());

  return (
    <div className={`list-search-bar${className ? ` ${className}` : ""}`}>
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
      <Input
        type="date"
        className="list-search-date"
        value={checkIn}
        aria-label="チェックイン日"
        onChange={(e) => setCheckIn(e.target.value)}
      />
      <Button
        type="button"
        variant="secondary"
        className="list-search-clear"
        disabled={!hasFilter}
        aria-label="検索をクリア"
        onClick={clearAll}
      >
        ×
      </Button>
    </div>
  );
}
