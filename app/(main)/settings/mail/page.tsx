import { PageHeader } from "@/components/PageHeader";
import { MailTemplatesView } from "@/components/mail/MailTemplatesView";
import { getMailTemplates } from "@/lib/queries/mail-templates";

export default async function MailTemplatesSettingsPage() {
  const { templates, error, tableMissing } = await getMailTemplates();

  return (
    <div className="settings-stack">
      <PageHeader
        title="メール定型文"
        description="返信メールで使う定型文の一覧と編集"
      />
      <MailTemplatesView
        initialTemplates={templates}
        loadError={error}
        tableMissing={tableMissing}
      />
    </div>
  );
}
