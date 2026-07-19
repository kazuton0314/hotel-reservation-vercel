"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  listHref: string;
  dirtyCount: number;
  committing: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

export function SetupCommitBar({
  listHref,
  dirtyCount,
  committing,
  onDiscard,
  onSave,
}: Props) {
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const backHref = qs ? `${listHref}?${qs}` : listHref;

  return (
    <div className="setup-commit-bar">
      <div className="setup-commit-meta">
        <Link href={backHref} className="btn btn-secondary btn-sm">
          ← 一覧へ
        </Link>
        <p className="setup-commit-status">
          {committing
            ? "保存中…"
            : dirtyCount > 0
              ? `未保存の変更 ${dirtyCount} 件`
              : "変更なし"}
        </p>
      </div>
      <div className="setup-commit-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={committing || dirtyCount === 0}
          onClick={onDiscard}
        >
          破棄
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={committing || dirtyCount === 0}
          onClick={onSave}
        >
          {committing ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
