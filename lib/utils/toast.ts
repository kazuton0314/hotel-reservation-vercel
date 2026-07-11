import { toast } from "sonner";
import { pushNotification } from "@/lib/utils/notification-center";

export function showSuccessToast(message: string) {
  pushNotification("success", message);
  toast.success(message);
}

export function showErrorToast(message: string) {
  pushNotification("error", message);
  toast.error(message);
}

/** 軽い案内（テーマ切替・更新完了など）。通知センターには残さない */
export function showInfoToast(message: string) {
  toast.message(message);
}
