import { MailTimeline } from "@/components/mail/MailTimeline";
import { MailTimelineStatusSync } from "@/components/mail/MailTimelineStatusSync";
import { getMailLogsForEntity } from "@/lib/queries/mail-logs";

type Props = {
  entityType: string;
  entityId: string;
};

export async function MailHistorySection({ entityType, entityId }: Props) {
  const { logs, error } = await getMailLogsForEntity(entityType, entityId);

  return (
    <div className="mail-history-section">
      <MailTimelineStatusSync entityType={entityType} entityId={entityId} />
      <h4 className="mail-history-title">送信履歴</h4>
      {error ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          履歴の読み込みに失敗しました
        </p>
      ) : (
        <MailTimeline logs={logs} />
      )}
    </div>
  );
}
