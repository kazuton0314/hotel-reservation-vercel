"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Props = {
  href: string;
  label?: string;
};

/** 一覧の検索条件を引き継いで一覧設定画面へ */
export function ListSetupEntryLink({ href, label = "一覧設定" }: Props) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  return (
    <Link
      href={qs ? `${href}?${qs}` : href}
      className="btn btn-secondary btn-sm"
    >
      {label}
    </Link>
  );
}
