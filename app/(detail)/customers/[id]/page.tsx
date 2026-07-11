import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DetailNav } from "@/components/detail/DetailNav";
import { Kv } from "@/components/detail/Kv";
import { RealtimeRefresh } from "@/components/realtime/RealtimeRefresh";
import { ConnectionError } from "@/components/SetupRequired";
import { Table, Td, Th } from "@/components/ui/table";
import { getCustomerDetail } from "@/lib/queries/customers";

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
        backHref="/customers"
        crumbs={[
          { label: "ホーム", href: "/" },
          { label: "顧客索引", href: "/customers" },
          { label: displayName },
        ]}
      />
      <div className="detail-block">
        <h3>顧客情報</h3>
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
      <div className="detail-block">
        <h3>予約履歴</h3>
        {!detail.reservations.length ? (
          <p className="empty" style={{ padding: 8 }}>
            予約履歴がありません
          </p>
        ) : (
          <div className="table-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>予約ID</Th>
                  <Th>日程</Th>
                  <Th>状態</Th>
                  <Th>経路</Th>
                </tr>
              </thead>
              <tbody>
                {detail.reservations.map((r) => (
                  <tr key={r.reservationId}>
                    <Td>
                      <Link
                        href={`/reservations/${encodeURIComponent(r.reservationId)}?from=customers&customer=${encodeURIComponent(linkId)}`}
                        className="btn btn-secondary btn-sm"
                      >
                        {r.reservationId}
                      </Link>
                    </Td>
                    <Td>
                      {r.checkIn}〜{r.checkOut}
                    </Td>
                    <Td>{r.status}</Td>
                    <Td>{r.channel || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
