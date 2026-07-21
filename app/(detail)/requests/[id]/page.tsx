import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DetailNav } from "@/components/detail/DetailNav";
import { DetailBlock } from "@/components/detail/DetailBlock";
import { FormSectionLabel, Kv } from "@/components/detail/Kv";
import { StatusRail } from "@/components/detail/StatusRail";
import { RequestDetailActions } from "@/components/requests/RequestDetailActions";
import { OverlapStayList } from "@/components/requests/OverlapStayList";
import { RequestMailBlock } from "@/components/requests/RequestMailBlock";
import { MailHistorySection } from "@/components/mail/MailHistorySection";
import { RequestUpdateForm } from "@/components/requests/RequestUpdateForm";
import { ConnectionError } from "@/components/SetupRequired";
import { RealtimeRefresh } from "@/components/realtime/RealtimeRefresh";
import { getOverlappingStays } from "@/lib/queries/overlapping-stays";
import { ArchiveRequestButton } from "@/components/requests/ArchiveRequestButton";
import { buildCustomerHistoryHref } from "@/lib/utils/customer-history-link";
import { getReservationsForLinking } from "@/lib/queries/reservations";
import { getRequestById } from "@/lib/queries/requests";
import { buildMailEntityContext } from "@/lib/services/mail-context";
import { createReadClient } from "@/lib/supabase/read";
import {
  normalizeRequestStatusForRail,
  REQUEST_STATUS_RAIL_BRANCH,
  REQUEST_STATUS_RAIL_MAIN,
} from "@/lib/utils/status-rail";
import { formatReceivedDateFromIso } from "@/lib/utils/received-date";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <AppShell hideNav>
        <RequestDetailContent id={decodeURIComponent(id)} />
      </AppShell>
  );
}

async function RequestDetailContent({ id }: { id: string }) {
  const { request, error } = await getRequestById(id);
  if (error) return <ConnectionError message={error} />;
  if (!request) notFound();

  const status = String(request.status ?? "リクエスト");
  const checkIn = asString(request.check_in);
  const checkOut = asString(request.check_out);
  const linkedId = asString(request.linked_reservation_id);

  const [{ stays }, { reservations: linkCandidates }, placeholderContext] =
    await Promise.all([
      checkIn
        ? getOverlappingStays(checkIn, checkOut, linkedId)
        : Promise.resolve({ stays: [], error: null }),
      getReservationsForLinking(),
      (async () => {
        const supabase = await createReadClient();
        return buildMailEntityContext(supabase, "request", id);
      })(),
    ]);

  const receivedAt = formatReceivedDateFromIso(
    asString(request.sheet_created_at) || asString(request.created_at)
  );

  const representativeName = asString(request.representative_name) || id;

  return (
    <>
      <RealtimeRefresh tables={["reservation_requests"]} notify />
      <DetailNav
        crumbs={[
          { label: "ホーム", href: "/" },
          { label: "リクエスト", href: "/requests" },
          { label: representativeName },
        ]}
      />

      <DetailBlock title="ステータス">
        <StatusRail
          mainSteps={REQUEST_STATUS_RAIL_MAIN}
          branchStep={REQUEST_STATUS_RAIL_BRANCH}
          currentId={normalizeRequestStatusForRail(status)}
        />
        <RequestDetailActions
          requestId={id}
          status={status}
          linkedReservationId={linkedId}
          linkCandidates={linkCandidates}
          updatedAt={asString(request.updated_at)}
        />
      </DetailBlock>

      <RequestMailBlock
        requestId={id}
        email={asString(request.email)}
        status={status}
        replyEmailSent={Boolean(request.reply_email_sent)}
        replyEmailSentAt={asString(request.reply_email_sent_at)}
        placeholderContext={placeholderContext}
      />

      <DetailBlock title="メール履歴">
        <MailHistorySection entityType="request" entityId={id} />
      </DetailBlock>

      <DetailBlock title="リクエスト内容">
        <FormSectionLabel>管理</FormSectionLabel>
        <Kv label="リクエストID" value={String(request.request_id)} />
        <Kv label="受付日時" value={receivedAt} />

        <FormSectionLabel>代表者</FormSectionLabel>
        <Kv label="代表者名" value={asString(request.representative_name)} />
        <Kv label="ふりがな" value={asString(request.name_kana)} multiline />
        <Kv label="グループ形態" value={asString(request.group_type)} />

        <FormSectionLabel>連絡先</FormSectionLabel>
        <Kv label="メールアドレス" value={asString(request.email)} />
        <Kv label="電話番号" value={asString(request.phone)} />
        <div className="detail-actions" style={{ marginTop: 10 }}>
          <Link
            href={buildCustomerHistoryHref({
              name: asString(request.representative_name),
              email: asString(request.email),
              phone: asString(request.phone),
            })}
            className="btn btn-secondary btn-sm"
          >
            この人の履歴
          </Link>
        </div>

        <FormSectionLabel>宿泊</FormSectionLabel>
        <Kv label="チェックイン日" value={checkIn} />
        <Kv label="チェックアウト日" value={checkOut} />
        <Kv
          label="泊数"
          value={request.nights ? `${request.nights}泊` : null}
        />
        <Kv label="宿泊人数" value={asString(request.guest_total)} />

        {asString(request.inquiry) ? (
          <>
            <FormSectionLabel>問い合わせ</FormSectionLabel>
            <Kv
              label="お問い合わせ内容"
              value={asString(request.inquiry)}
              multiline
            />
          </>
        ) : null}

        {linkedId ? (
          <>
            <FormSectionLabel>処理結果</FormSectionLabel>
            <Kv label="連携予約ID" value={linkedId} />
          </>
        ) : null}
      </DetailBlock>

      <DetailBlock title="編集">
        <RequestUpdateForm
          requestId={id}
          status={status}
          internalMemo={asString(request.internal_memo)}
          linkedReservationId={linkedId}
        />
      </DetailBlock>

      {checkIn ? (
        <DetailBlock id="req-overlap-section">
          <div className="section-title">同期間の他組の予約</div>
          <p className="detail-hint">
            チェックイン日・チェックアウト日に出入りする組も含みます
          </p>
          <OverlapStayList stays={stays} anchorCheckIn={checkIn} />
          <div className="detail-actions detail-actions-inline">
            <Link
              href={`/calendar?mode=day&date=${encodeURIComponent(checkIn)}`}
              className="btn btn-secondary"
            >
              {checkIn} の予定画面を開く
            </Link>
          </div>
        </DetailBlock>
      ) : null}

      <ArchiveRequestButton
        requestId={id}
        isArchived={Boolean(request.is_archived)}
      />
    </>
  );
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
