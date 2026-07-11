import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ThemeSetting } from "@/components/settings/ThemeSetting";
import { ActivityFeedPanel } from "@/components/settings/ActivityFeedPanel";

export default function PreferencesPage() {
  return (
    <div className="settings-stack">
      <PageHeader
        title="表示と通知"
        description="画面表示の設定と、この端末に記録された操作通知"
      />

      <SettingsSection title="表示">
        <ThemeSetting />
      </SettingsSection>

      <SettingsSection
        title="操作通知"
        description="保存・送信などの操作結果はこの端末のブラウザにのみ保存されます。運用コンソールでも同じ内容を確認できます。"
      >
        <ActivityFeedPanel notifyOnly />
      </SettingsSection>
    </div>
  );
}
