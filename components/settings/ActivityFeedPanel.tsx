"use client";

import { useEffect, useState } from "react";
import {
  clearNotifications,
  listNotifications,
  type AppNotification,
} from "@/lib/utils/notification-center";
import { Button } from "@/components/ui/button";

type SyncRun = {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  rows_imported?: number | null;
  rows_skipped?: number | null;
  error_message?: string | null;
};

type ImportRun = {
  id: string;
  job_name: string;
  target?: string | null;
  status: string;
  started_at: string;
  error_message?: string | null;
};

type Tab = "sync" | "import" | "notify";

type Props = {
  syncRuns?: SyncRun[];
  importRuns?: ImportRun[];
  notifyOnly?: boolean;
};

function statusBadgeClass(status: string) {
  if (status === "success") return "badge badge-ok";
  if (status === "error") return "badge badge-warn";
  return "badge badge-muted";
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityFeedPanel({
  syncRuns = [],
  importRuns = [],
  notifyOnly = false,
}: Props) {
  const [tab, setTab] = useState<Tab>(notifyOnly ? "notify" : "sync");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    const refresh = () => setNotifications(listNotifications());
    refresh();
    window.addEventListener("mr-notifications-changed", refresh);
    return () => window.removeEventListener("mr-notifications-changed", refresh);
  }, []);

  return (
    <div className="settings-activity">
      {!notifyOnly ? (
        <div className="settings-segmented settings-activity-tabs">
          <Button
            type="button"
            size="sm"
            variant={tab === "sync" ? "default" : "secondary"}
            onClick={() => setTab("sync")}
          >
            フォーム同期
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "import" ? "default" : "secondary"}
            onClick={() => setTab("import")}
          >
            インポート
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "notify" ? "default" : "secondary"}
            onClick={() => setTab("notify")}
          >
            操作通知
          </Button>
        </div>
      ) : null}

      {tab === "sync" ? (
        syncRuns.length === 0 ? (
          <p className="settings-empty">同期履歴はまだありません</p>
        ) : (
          <ul className="settings-activity-list">
            {syncRuns.map((run) => (
              <li key={run.id} className="settings-activity-item">
                <div className="settings-activity-head">
                  <strong>{run.job_name}</strong>
                  <span className={statusBadgeClass(run.status)}>{run.status}</span>
                </div>
                <p className="settings-activity-meta">{formatWhen(run.started_at)}</p>
                {run.rows_imported != null ? (
                  <p className="settings-activity-meta">
                    取込 {run.rows_imported} 件 / スキップ {run.rows_skipped ?? 0} 件
                  </p>
                ) : null}
                {run.error_message ? (
                  <p className="settings-activity-error">{run.error_message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "import" ? (
        importRuns.length === 0 ? (
          <p className="settings-empty">インポート履歴はまだありません</p>
        ) : (
          <ul className="settings-activity-list">
            {importRuns.map((run) => (
              <li key={run.id} className="settings-activity-item">
                <div className="settings-activity-head">
                  <strong>
                    {run.job_name}
                    {run.target ? ` · ${run.target}` : ""}
                  </strong>
                  <span className={statusBadgeClass(run.status)}>{run.status}</span>
                </div>
                <p className="settings-activity-meta">{formatWhen(run.started_at)}</p>
                {run.error_message ? (
                  <p className="settings-activity-error">{run.error_message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "notify" ? (
        <>
          <div className="settings-toolbar settings-toolbar-compact">
            <p className="settings-activity-meta" style={{ margin: 0 }}>
              保存・送信などの操作通知（最大60件・この端末のみ）
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!notifications.length}
              onClick={() => {
                clearNotifications();
                setNotifications([]);
              }}
            >
              クリア
            </Button>
          </div>
          {!notifications.length ? (
            <p className="settings-empty">通知はありません</p>
          ) : (
            <ul className="settings-activity-list">
              {notifications.map((item) => (
                <li key={item.id} className={`settings-activity-item notify-${item.kind}`}>
                  <p className="settings-activity-message">{item.message}</p>
                  <p className="settings-activity-meta">
                    {new Date(item.createdAt).toLocaleString("ja-JP")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
