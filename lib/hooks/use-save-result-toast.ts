"use client";

import { useEffect, useRef, useState } from "react";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

/** 保存ボタンの pending が解けたタイミングで、部屋割と同じトーストを出す */
export function useSaveResultToast(
  isPending: boolean,
  state: { ok: boolean; message?: string },
  successMessage = "保存しました"
): boolean {
  const wasPending = useRef(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (isPending) {
      wasPending.current = true;
      setJustSaved(false);
      return;
    }
    if (!wasPending.current) return;
    wasPending.current = false;
    if (state.ok) {
      showSuccessToast(successMessage);
      setJustSaved(true);
      return;
    }
    if (state.message) showErrorToast(state.message);
  }, [isPending, state, successMessage]);

  return justSaved;
}
