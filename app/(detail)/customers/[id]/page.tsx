import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CustomerReservationHistory } from "@/components/customers/CustomerReservationHistory";
import { DetailNav } from "@/components/detail/DetailNav";
import { Kv } from "@/components/detail/Kv";
import { RealtimeRefresh } from "@/components/realtime/RealtimeRefresh";
import { ConnectionError } from "@/components/SetupRequired";
import { getCustomerDetail } from "@/lib/queries/customers";
import { isEphemeralCustomerKey } from "@/lib/services/customer-index";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const openId = decodeURIComponent(id);

  return (
    <AppShell title="顧客詳細" hideNav>
      <CustomerDetailContent openId={openId} />
    </AppShell>
  );
}

async function CustomerDetailContent({ openId }: { openId: string }) {
  const { detail, error } = await getCustomerDetail(openId);
  if (error) return <ConnectionError message={error} />;
  if (!detail) notFound();

  const linkId = detail.customerId || detail.customerKey;
  const displayName = detail.representativeName || linkId;

  return (
    <>
      <RealtimeRefresh tables={["customers", "reservations"]} notify />
      <DetailNav
        backSection="customers"
        crumbs={[
          { label: "ホーム", href: "/" },
          { label: "顧客索引", href: "/customers", section: "customers" },
          { label: displayName },
        ]}
      />
      <div className="detail-block customer-detail-block">
        <h3>顧客情報</h3>
        {isEphemeralCustomerKey(detail.customerKey) ? (
          <p className="form-hint">
            連絡先未登録のため顧客索引・リピーター判定の対象外です（この予約のみ表示）。
          </p>
        ) : null}
        {detail.customerId ? <Kv label="顧客ID" value={detail.customerId} /> : null}
        <Kv label="代表者" value={detail.representativeName} />
        {detail.nameKana ? <Kv label="ふりがな" value={detail.nameKana} /> : null}
        <Kv
          label="来館回数"
          value={`${detail.visitCount}回${detail.isRepeater ? "（リピーター）" : ""}`}
        />
        {detail.lastCheckOut ? (
          <Kv label="最終OUT" value={detail.lastCheckOut} />
        ) : null}
        {detail.email ? <Kv label="メール" value={detail.email} /> : null}
        {detail.phone ? <Kv label="電話" value={detail.phone} /> : null}
      </div>
      <div className="detail-block customer-detail-block">
        <h3>予約履歴</h3>
        <CustomerReservationHistory
          reservations={detail.reservations}
          customerLinkId={linkId}
        />
      </div>
    </>
  );
}
