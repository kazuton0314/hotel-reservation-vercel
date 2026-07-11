"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      richColors
      closeButton
      toastOptions={{
        className: "app-toast",
        duration: 3200,
      }}
      offset="calc(var(--nav-h) + var(--safe-b) + 12px)"
    />
  );
}
