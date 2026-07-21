"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { importReservationsAction } from "@/lib/actions/sync";
import { Button } from "@/components/ui/button";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

export function SyncImportButton() {
  const router = useRouter();
  const [pending, startImport] = useTransition();

  const handleImport = () => {
    startImport(async () => {
      const result = await importReservationsAction();
      if (result.ok) {
        showSuccessToast(result.message);
        router.refresh();
      } else {
        showErrorToast(result.message);
      }
    });
  };

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={handleImport}
    >
      {pending ? "開始中…" : "フォーム回答を取り込む"}
    </Button>
  );
}
