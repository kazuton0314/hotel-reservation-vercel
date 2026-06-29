import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RequestUpdateForm } from "@/components/requests/RequestUpdateForm";
import { ConnectionError } from "@/components/SetupRequired";
import { PageHeader } from "@/components/PageHeader";
import { SupabaseGate } from "@/components/SupabaseGate";
import { getRequestById } from "@/lib/queries/requests";

type PageProps = {
  params: Promise<{ id: string }>;
};

const DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: "request_id", label: "リクエストID" },
  { key: "status", label: "ステータス" },
  { key: "representative_name", label: "代表者名" },
  { key: "email", label: "メール" },
  { key: "phone", label: "電話番号" },
  { key: "check_in", label: "チェックイン" },
  { key: "check_out", label: "チェックアウト" },
  { key: "nights", label: "泊数" },
  { key: "guest_total", label: "宿泊人数" },
  { key: "inquiry", label: "お問い合わせ内容" },
  { key: "reply_email_sent", label: "返信メール送付済" },
  { key: "reply_email_sent_at", label: "返信メール送付日時" },
  { key: "updated_at", label: "更新日時" },
];

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <SupabaseGate>
      <AppShell>
        <RequestDetailContent id={decodeURIComponent(id)} />
      </AppShell>
    </SupabaseGate>
  );
}

async function RequestDetailContent({ id }: { id: string }) {
  const { request, error } = await getRequestById(id);

  if (error) return <ConnectionError message={error} />;
  if (!request) notFound();

  return (
    <>
      <div className="mb-4">
        <Link href="/requests" className="text-sm text-zinc-500 hover:underline">
          ← リクエスト一覧に戻る
        </Link>
      </div>

      <PageHeader
        title={String(request.representative_name || request.request_id)}
        description={String(request.request_id)}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-zinc-200 bg-white">
          <h2 className="border-b border-zinc-100 px-4 py-3 font-semibold">
            リクエスト情報
          </h2>
          <dl className="divide-y divide-zinc-100">
            {DETAIL_FIELDS.map(({ key, label }) => {
              const value = request[key];
              if (value === null || value === undefined || value === "") return null;
              return (
                <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-3">
                  <dt className="text-sm text-zinc-500">{label}</dt>
                  <dd className="sm:col-span-2 text-sm whitespace-pre-wrap">
                    {String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>

          {request.linked_reservation ? (
            <div className="border-t border-zinc-100 px-4 py-4 text-sm">
              <p className="font-semibold text-zinc-800">連携本予約</p>
              <p className="mt-1 text-zinc-700">
                {request.linked_reservation.reservation_id} /{" "}
                {request.linked_reservation.representative_name || "—"} /{" "}
                {request.linked_reservation.status}
              </p>
              <Link
                href={`/reservations/${encodeURIComponent(
                  request.linked_reservation.reservation_id
                )}`}
                className="mt-2 inline-block text-emerald-700 hover:underline"
              >
                本予約詳細を開く →
              </Link>
            </div>
          ) : null}
        </section>

        <aside className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">更新（Phase 2）</h2>
          <p className="mb-4 text-xs text-zinc-500">
            承認・却下・本予約連携済ステータスの更新を行います。
          </p>
          <RequestUpdateForm
            requestId={String(request.request_id)}
            status={String(request.status ?? "リクエスト")}
            rejectReason={asString(request.reject_reason)}
            internalMemo={asString(request.internal_memo)}
            linkedReservationId={asString(request.linked_reservation_id)}
          />
        </aside>
      </div>
    </>
  );
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
