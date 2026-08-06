"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DEBOUNCE_MS = 320;

type ListSearchState = {
  keyword: string;
  setKeyword: (value: string) => void;
  checkIn: string;
  setCheckIn: (value: string) => void;
  clearAll: () => void;
};

const ListSearchContext = createContext<ListSearchState | null>(null);

export function useListSearch() {
  const ctx = useContext(ListSearchContext);
  if (!ctx) {
    throw new Error("useListSearch must be used within ListSearchProvider");
  }
  return ctx;
}

/** 一覧のキーワード・チェックイン検索（入力は即時、URL は debounce 同期） */
export function ListSearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const urlQ = searchParams.get("q") ?? "";
  const urlCheckIn = searchParams.get("checkIn") ?? "";

  const [keyword, setKeyword] = useState(urlQ);
  const [checkIn, setCheckIn] = useState(urlCheckIn);
  const lastPushed = useRef({ q: urlQ, checkIn: urlCheckIn });

  useEffect(() => {
    const fromOurPush =
      urlQ.trim() === lastPushed.current.q.trim() &&
      urlCheckIn.trim() === lastPushed.current.checkIn.trim();
    if (fromOurPush) return;
    setKeyword(urlQ);
    setCheckIn(urlCheckIn);
    lastPushed.current = { q: urlQ, checkIn: urlCheckIn };
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
      const params = new URLSearchParams(searchParamsRef.current.toString());
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
  }, [keyword, checkIn, pathname, router]);

  const clearAll = useCallback(() => {
    setKeyword("");
    setCheckIn("");
    lastPushed.current = { q: "", checkIn: "" };
    const params = new URLSearchParams(searchParamsRef.current.toString());
    params.delete("q");
    params.delete("checkIn");
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);

  return (
    <ListSearchContext.Provider
      value={{ keyword, setKeyword, checkIn, setCheckIn, clearAll }}
    >
      {children}
    </ListSearchContext.Provider>
  );
}
