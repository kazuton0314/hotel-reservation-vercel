export type AppNotification = {
  id: string;
  kind: "success" | "error" | "info";
  message: string;
  createdAt: number;
};

const KEY = "mr_notifications_v1";

function readAll(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: AppNotification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 60)));
  queueMicrotask(() => {
    window.dispatchEvent(new Event("mr-notifications-changed"));
  });
}

export function pushNotification(
  kind: AppNotification["kind"],
  message: string
) {
  const current = readAll();
  current.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    message,
    createdAt: Date.now(),
  });
  writeAll(current);
}

export function listNotifications() {
  return readAll();
}

export function clearNotifications() {
  writeAll([]);
}
