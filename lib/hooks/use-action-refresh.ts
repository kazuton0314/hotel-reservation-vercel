"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";

type ActionResult = {
  ok: boolean;
  message?: string;
  conflict?: boolean;
};

type Options = {
  successMessage?: string;
  refreshOnSuccess?: boolean;
  refreshOnConflict?: boolean;
};

export function useActionRefresh<T extends ActionResult>(
  action: (prev: T, formData: FormData) => Promise<T>,
  initialState: T,
  options: Options = {}
) {
  const router = useRouter();
  const [state, setState] = useState<T>(initialState);
  const [pending, startTransition] = useTransition();
  const {
    successMessage,
    refreshOnSuccess = true,
    refreshOnConflict = true,
  } = options;

  const submit = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        const result = await action(state, formData);
        setState(result);

        if (result.ok) {
          if (successMessage) showSuccessToast(successMessage);
          if (refreshOnSuccess) router.refresh();
          return;
        }

        if (result.message) {
          showErrorToast(result.message);
          if (result.conflict && refreshOnConflict) router.refresh();
        }
      });
    },
    [action, state, router, successMessage, refreshOnSuccess, refreshOnConflict]
  );

  return { state, submit, pending };
}
