import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ActivityFeedPanel } from "@/components/settings/ActivityFeedPanel";
import { OperationsConsole } from "@/components/settings/OperationsConsole";
import {
  getCustomerMergeCandidates,
  getRecentImportJobRuns,
  getRequestReservationLinkCandidates,
} from "@/lib/queries/ops";
import { getRecentSyncRuns } from "@/lib/queries/reservations";

export default async function OperationsPage() {
  const [
    { candidates: linkCandidates },
    { candidates: mergeCandidates },
    { runs: importRuns },
    { runs: syncRuns },
  ] = await Promise.all([
    getRequestReservationLinkCandidates(60),
    getCustomerMergeCandidates(60),
    getRecentImportJobRuns(20),
    getRecentSyncRuns(20),
  ]);

  return (
    <div className="settings-stack">
      <PageHeader
        title="運用コンソール"
        description="データの整合性確認と、同期・インポート・操作通知の履歴"
      />

      <OperationsConsole
        linkCandidates={linkCandidates}
        mergeCandidates={mergeCandidates}
      />

      <SettingsSection
        title="履歴と通知"
        description="フォーム同期・CSVインポート・画面操作の記録をまとめて確認できます"
      >
        <ActivityFeedPanel syncRuns={syncRuns} importRuns={importRuns} />
      </SettingsSection>
    </div>
  );
}
