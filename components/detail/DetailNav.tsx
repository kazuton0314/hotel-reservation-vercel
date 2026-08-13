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
  /** true のとき履歴を積み増さず現在ページを置き換える */
  replace?: boolean;
};

type Props = {
  crumbs: DetailCrumb[];
  backHref?: string;
  /** backHref 未指定時、このセクションの記憶 URL へ戻る（履歴が無い場合の保険） */
  backSection?: NavSection;
  backLabel?: string;
  /**
   * 未指定時は backHref が無いときだけ history.back()。
   * 顧客詳細など「一覧へ戻る」先が決まっている画面は false にする。
   */
  preferHistoryBack?: boolean;
  /** 戻る先 URL へ進むとき履歴を置き換える */
  replaceBackHref?: boolean;
};

function CrumbLink({ crumb }: { crumb: DetailCrumb }) {
  const fallback = crumb.href ?? "/";
  const href = crumb.section
    ? getSectionRememberedHref(crumb.section, fallback)
    : fallback;

  return (
    <Link href={href} replace={crumb.replace} className="breadcrumb-link">
      {crumb.label}
    </Link>
  );
}

export function DetailNav({
  crumbs,
  backHref,
  backSection,
  backLabel,
  preferHistoryBack,
  replaceBackHref = false,
}: Props) {
  const router = useRouter();
  const resolvedBackHref = backHref
    ? backHref
    : backSection
      ? getSectionRememberedHref(backSection)
      : undefined;
  const useHistoryBack = preferHistoryBack ?? !backHref;

  return (
    <nav className="detail-nav" aria-label="パンくず">
      <DetailBack
        href={resolvedBackHref}
        label={backLabel}
        preferHistoryBack={useHistoryBack}
        replace={replaceBackHref}
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
