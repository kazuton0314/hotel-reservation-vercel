import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { runAllDiagnostics } from "@/lib/setup/diagnostics";
import { getSetupChecks } from "@/lib/setup/env";

export default async function SetupPage() {
  return <SetupContent />;
}

async function SetupContent() {
  const checks = getSetupChecks();
  const diagnostics = await runAllDiagnostics();
  const failedChecks = checks.filter((c) => !c.ok);
  const failedDiagnostics = diagnostics.filter((d) => !d.ok);

  return (
    <div className="settings-stack">
      <PageHeader
        title="セットアップ"
        description="環境変数と外部サービス接続の状態を確認します（秘密情報は表示しません）"
      />

      <SettingsSection
        title="環境変数"
        description={
          failedChecks.length
            ? `${failedChecks.length} 件の未設定項目があります`
            : "必要な環境変数はすべて設定済みです"
        }
      >
        <ul className="settings-check-list">
          {checks.map((c) => (
            <li key={c.id} className="settings-check-item">
              <span className={c.ok ? "badge badge-ok" : "badge badge-warn"}>
                {c.ok ? "OK" : "要確認"}
              </span>
              <div className="settings-check-body">
                <p className="settings-check-label">{c.label}</p>
                <p className="settings-check-detail">{c.detail}</p>
                {!c.ok && c.userAction ? (
                  <p className="settings-check-action">{c.userAction}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection
        title="接続テスト"
        description={
          failedDiagnostics.length
            ? `${failedDiagnostics.length} 件の接続に問題があります`
            : "主要な接続テストは成功しています"
        }
      >
        <ul className="settings-check-list">
          {diagnostics.map((d) => (
            <li key={d.name} className="settings-check-item">
              <span className={d.ok ? "badge badge-ok" : "badge badge-warn"}>
                {d.ok ? "OK" : "NG"}
              </span>
              <div className="settings-check-body">
                <p className="settings-check-label">{d.name}</p>
                <p className="settings-check-detail">{d.message}</p>
              </div>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="関連設定">
        <div className="settings-link-row">
          <Link href="/settings/sync" className="settings-link-card">
            フォーム同期
          </Link>
          <Link href="/settings/preferences" className="settings-link-card">
            表示と通知
          </Link>
        </div>
      </SettingsSection>
    </div>
  );
}
