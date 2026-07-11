"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const DEBOUNCE_MS = 320;

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

  const keywordFocused = useRef(false);
  const checkInFocused = useRef(false);
  const keywordComposing = useRef(false);
  const lastPushed = useRef({ q: urlQ, checkIn: urlCheckIn });

  // 自分が router.replace した直後は URL→state の同期をスキップ（入力が跳ねるのを防ぐ）
  useEffect(() => {
    const fromOurPush =
      urlQ.trim() === lastPushed.current.q.trim() &&
      urlCheckIn.trim() === lastPushed.current.checkIn.trim();
    if (fromOurPush) return;

    if (!keywordFocused.current) setKeyword(urlQ);
    if (!checkInFocused.current) setCheckIn(urlCheckIn);
  }, [urlQ, urlCheckIn]);

  useEffect(() => {
    const nextQ = keyword.trim();
    const nextCheckIn = checkIn.trim();
    if (
      nextQ === lastPushed.current.q.trim() &&
      nextCheckIn === lastPushed.current.checkIn.trim()
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextQ) params.set("q", nextQ);
      else params.delete("q");
      if (nextCheckIn) params.set("checkIn", nextCheckIn);
      else params.delete("checkIn");
      params.delete("page");

      lastPushed.current = { q: nextQ, checkIn: nextCheckIn };
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [keyword, checkIn, pathname, router, searchParams]);

  function clearAll() {
    setKeyword("");
    setCheckIn("");
    lastPushed.current = { q: "", checkIn: "" };
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("checkIn");
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
        onFocus={() => {
          keywordFocused.current = true;
        }}
        onBlur={() => {
          keywordFocused.current = false;
        }}
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
        onFocus={() => {
          checkInFocused.current = true;
        }}
        onBlur={() => {
          checkInFocused.current = false;
        }}
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
