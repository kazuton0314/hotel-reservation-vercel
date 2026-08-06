"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailBack } from "@/components/detail/DetailBack";
import { Button } from "@/components/ui/button";
import {
  getSectionRememberedHref,
  type NavSection,
} from "@/lib/nav/session-memory";

export type DetailCrumb = {
  label: string;
  href?: string;
  /** 指定時は詳細→パンくずでも一覧の検索条件付き URL を優先 */
  section?: NavSection;
};

type Props = {
  crumbs: DetailCrumb[];
  backHref?: string;
  /** backHref 未指定時、このセクションの記憶 URL へ戻る（履歴が無い場合の保険） */
  backSection?: NavSection;
  backLabel?: string;
};

function CrumbLink({ crumb }: { crumb: DetailCrumb }) {
  const fallback = crumb.href ?? "/";
  const href = crumb.section
    ? getSectionRememberedHref(crumb.section, fallback)
    : fallback;

  return (
    <Link href={href} className="breadcrumb-link">
      {crumb.label}
    </Link>
  );
}

export function DetailNav({
  crumbs,
  backHref,
  backSection,
  backLabel,
}: Props) {
  const router = useRouter();
  const resolvedBackHref = backHref
    ? backHref
    : backSection
      ? getSectionRememberedHref(backSection)
      : undefined;

  return (
    <nav className="detail-nav" aria-label="パンくず">
      <DetailBack
        href={resolvedBackHref}
        label={backLabel}
        preferHistoryBack={!backHref}
      />
      <ol className="breadcrumb">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="breadcrumb-item">
              {(crumb.href || crumb.section) && !isLast ? (
                <CrumbLink crumb={crumb} />
              ) : (
                <span
                  className="breadcrumb-current"
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="detail-nav-refresh"
        onClick={() => router.refresh()}
      >
        更新
      </Button>
    </nav>
  );
}
