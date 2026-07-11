"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEBOUNCE_MS = 280;

type Props = {
  className?: string;
};

export function ListSearchBar({ className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlQ = searchParams.get("q") ?? "";
  const urlCheckIn = searchParams.get("checkIn") ?? "";

  const [keyword, setKeyword] = useState(urlQ);
  const [checkIn, setCheckIn] = useState(urlCheckIn);

  useEffect(() => {
    setKeyword(urlQ);
    setCheckIn(urlCheckIn);
  }, [urlQ, urlCheckIn]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const nextQ = keyword.trim();
      const nextCheckIn = checkIn.trim();

      if (nextQ) params.set("q", nextQ);
      else params.delete("q");

      if (nextCheckIn) params.set("checkIn", nextCheckIn);
      else params.delete("checkIn");

      params.delete("page");

      const next = params.toString();
      const current = searchParams.toString();
      if (next !== current) {
        router.replace(next ? `${pathname}?${next}` : pathname);
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [keyword, checkIn, pathname, router, searchParams]);

  function clearAll() {
    setKeyword("");
    setCheckIn("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("checkIn");
    params.delete("page");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }

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
