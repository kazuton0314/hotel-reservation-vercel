"use client";

import { useEffect, useState } from "react";
import {
  clearNotifications,
  listNotifications,
  type AppNotification,
} from "@/lib/utils/notification-center";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    const refresh = () => setItems(listNotifications());
    refresh();
    const onOpen = () => {
      refresh();
      setOpen(true);
    };
    window.addEventListener("mr-notifications-changed", refresh);
    window.addEventListener("mr-open-notifications", onOpen);
    return () => {
      window.removeEventListener("mr-notifications-changed", refresh);
      window.removeEventListener("mr-open-notifications", onOpen);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="notify-panel">
        <h3 className="mail-modal-title">通知センター</h3>
        <p className="detail-hint" style={{ marginTop: 0 }}>
          保存・送信などの重要な操作のみ記録（最大60件）
        </p>
        <div className="notify-list">
          {!items.length ? (
            <p className="empty" style={{ padding: 0 }}>
              通知はありません
            </p>
          ) : (
            items.map((item) => (
              <article key={item.id} className={`notify-item ${item.kind}`}>
                <p>{item.message}</p>
                <small>{new Date(item.createdAt).toLocaleString("ja-JP")}</small>
              </article>
            ))
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!items.length}
          onClick={() => {
            clearNotifications();
            setItems([]);
          }}
        >
          クリア
        </Button>
      </DialogContent>
    </Dialog>
  );
}
