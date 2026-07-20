"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  pending?: boolean;
  onClose: () => void;
  onApprove: (createProvisional: boolean) => void;
};

/** 承認時の1段階確認（仮予約作成 / しない / キャンセル） */
export function RequestApproveDialog({
  open,
  pending = false,
  onClose,
  onApprove,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="action-dialog-overlay"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-approve-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="request-approve-dialog-title" className="action-dialog-title">
          リクエストを承認
        </p>
        <p className="action-dialog-hint">
          仮予約を予約台帳に作成しますか？
        </p>
        <div className="action-dialog-actions">
          <Button
            type="button"
            disabled={pending}
            onClick={() => onApprove(true)}
          >
            仮予約を作成
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onApprove(false)}
          >
            しない
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
