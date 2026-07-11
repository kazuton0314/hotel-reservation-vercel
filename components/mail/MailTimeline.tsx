import { resendStatusLabel } from "@/lib/services/resend-status";
import type { MailLogItem } from "@/lib/queries/mail-logs";

type Props = {
  logs: MailLogItem[];
  emptyMessage?: string;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: string, providerStatus: string | null) {
  const key = providerStatus ?? status;
  if (key === "delivered" || key === "sent") return "mail-timeline-status-ok";
  if (key === "failed" || key === "bounced") return "mail-timeline-status-error";
  if (key === "skipped") return "mail-timeline-status-muted";
  return "mail-timeline-status-pending";
}

export function MailTimeline({ logs, emptyMessage = "送信履歴はまだありません" }: Props) {
  if (!logs.length) {
    return <p className="detail-hint">{emptyMessage}</p>;
  }

  return (
    <ol className="mail-timeline">
      {logs.map((log) => {
        const delivery = resendStatusLabel(log.providerStatus ?? log.status);
        return (
          <li key={log.mailLogId} className="mail-timeline-item">
            <div className="mail-timeline-marker" aria-hidden />
            <div className="mail-timeline-body">
              <div className="mail-timeline-head">
                <time className="mail-timeline-time" dateTime={log.createdAt}>
                  {formatWhen(log.createdAt)}
                </time>
                <span
                  className={`mail-timeline-status ${statusClass(log.status, log.providerStatus)}`}
                >
                  {delivery}
                </span>
              </div>
              <p className="mail-timeline-subject">{log.subject}</p>
              <p className="mail-timeline-meta">
                To: {log.toEmail}
                {log.templateId ? ` · ${log.templateId}` : ""}
              </p>
              {log.bodyPreview ? (
                <p className="mail-timeline-preview">{log.bodyPreview}</p>
              ) : null}
              {log.errorMessage ? (
                <p className="mail-timeline-error">{log.errorMessage}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
