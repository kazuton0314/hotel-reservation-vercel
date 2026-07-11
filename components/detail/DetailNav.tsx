"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailBack } from "@/components/detail/DetailBack";
import { Button } from "@/components/ui/button";

export type DetailCrumb = {
  label: string;
  href?: string;
};

type Props = {
  crumbs: DetailCrumb[];
  backHref?: string;
  backLabel?: string;
};

export function DetailNav({ crumbs, backHref, backLabel }: Props) {
  const router = useRouter();

  return (
    <nav className="detail-nav" aria-label="パンくず">
      <DetailBack href={backHref} label={backLabel} />
      <ol className="breadcrumb">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="breadcrumb-item">
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="breadcrumb-link">
                  {crumb.label}
                </Link>
              ) : (
                <span className="breadcrumb-current" aria-current={isLast ? "page" : undefined}>
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
