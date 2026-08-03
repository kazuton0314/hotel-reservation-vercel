import { ConnectionError } from "@/components/SetupRequired";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SyncImportButton } from "@/components/settings/SyncImportButton";
import {
  getFormImportCounts,
  getRecentSyncRuns,
} from "@/lib/queries/reservations";
import { formatDateTimeJa } from "@/lib/utils/date-label";

export default async function SyncSettingsPage() {
  return <SyncContent />;
}

async function SyncContent() {
  const [importCounts, { runs, error }] = await Promise.all([
    getFormImportCounts(),
    getRecentSyncRuns(15),
  ]);

  if (error) return <ConnectionError message={error} />;

  return (
    <div className="settings-stack">
      <PageHeader
        title="フォーム同期"
        description="Googleフォーム回答スプシから、新規行だけをSupabaseへ取り込みます"
      />

      <SettingsSection title="取込状況">
        <div className="settings-stat-grid">
          <div className="settings-stat-card">
            <p className="settings-stat-label">本予約フォーム</p>
            <p className="settings-stat-value">{importCounts.studio}</p>
          </div>
          <div className="settings-stat-card">
            <p className="settings-stat-label">リクエストフォーム</p>
            <p className="settings-stat-value">{importCounts.request}</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="手動取込"
        description="通常は本番で毎日自動実行されます。急ぎ確認したいときだけ実行してください。"
      >
        <div className="settings-toolbar">
          <SyncImportButton />
        </div>
        <p className="settings-inline-note">
          Vercel Hobby プランでは Cron は1日1回までです。より頻繁な自動取込が必要な場合は Pro プランまたは外部 Cron から API を呼び出してください。
        </p>
      </SettingsSection>

      <SettingsSection title="最近の同期">
        {runs.length === 0 ? (
          <p className="settings-empty">同期履歴はまだありません</p>
        ) : (
          <ul className="settings-activity-list">
            {runs.map((run) => (
              <li key={run.id} className="settings-activity-item">
                <div className="settings-activity-head">
                  <strong>{run.job_name}</strong>
                  <span
                    className={
                      run.status === "success"
                        ? "badge badge-ok"
                        : run.status === "error"
                          ? "badge badge-warn"
                          : "badge badge-muted"
                    }
                  >
                    {run.status}
                  </span>
                </div>
                <p className="settings-activity-meta">
                  {formatDateTimeJa(run.started_at)}
                  {run.rows_imported != null
                    ? ` · 取込 ${run.rows_imported} / スキップ ${run.rows_skipped ?? 0}`
                    : ""}
                </p>
                {run.error_message ? (
                  <p className="settings-activity-error">{run.error_message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
