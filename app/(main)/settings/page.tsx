import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ThemeSetting } from "@/components/settings/ThemeSetting";

const GROUPS = [
  {
    label: "日常運用",
    items: [
      {
        href: "/settings/sync",
        title: "フォーム同期",
        description: "回答スプシの取込状況と手動実行",
      },
      {
        href: "/settings/operations",
        title: "運用コンソール",
        description: "重複レビュー・顧客統合・履歴",
      },
    ],
  },
  {
    label: "コンテンツ",
    items: [
      {
        href: "/settings/mail",
        title: "メール定型文",
        description: "返信テンプレートの一覧と編集",
      },
    ],
  },
  {
    label: "システム",
    items: [
      {
        href: "/settings/setup",
        title: "セットアップ",
        description: "環境変数と接続状態の確認",
      },
    ],
  },
] as const;

export default function SettingsIndexPage() {
  return (
    <div className="settings-stack">
      <PageHeader title="設定" description="施設運用に関する設定と管理画面" />

      <SettingsSection title="表示">
        <ThemeSetting />
        <p className="settings-inline-note">
          操作通知の履歴は{" "}
          <Link href="/settings/preferences" className="settings-link">
            表示と通知
          </Link>{" "}
          または運用コンソールで確認できます。
        </p>
      </SettingsSection>

      {GROUPS.map((group) => (
        <section key={group.label} className="settings-index-group">
          <h2 className="settings-index-group-label">{group.label}</h2>
          <div className="settings-index-grid">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className="card settings-index-card">
                <p className="settings-index-card-title">{item.title}</p>
                <p className="settings-index-card-desc">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
