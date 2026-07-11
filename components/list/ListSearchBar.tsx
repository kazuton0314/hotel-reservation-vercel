"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useListSearch } from "@/components/list/ListSearchProvider";

type Props = {
  className?: string;
};

export function ListSearchBar({ className }: Props) {
  const { keyword, setKeyword, checkIn, setCheckIn, clearAll } = useListSearch();
  const keywordComposing = useRef(false);
  const hasFilter = Boolean(keyword.trim() || checkIn.trim());

  return (
    <div className={`list-search-bar${className ? ` ${className}` : ""}`}>
      <Input
        type="search"
        className="list-search-keyword"
        placeholder="名前・メール・電話・ID"
        value={keyword}
        autoComplete="off"
        aria-label="キーワード検索"
        onCompositionStart={() => {
          keywordComposing.current = true;
        }}
        onCompositionEnd={(e) => {
          keywordComposing.current = false;
          setKeyword(e.currentTarget.value);
        }}
        onChange={(e) => {
          if (keywordComposing.current) return;
          setKeyword(e.target.value);
        }}
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
