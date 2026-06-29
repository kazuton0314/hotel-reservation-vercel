import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ConnectionError } from "@/components/SetupRequired";
import { PageHeader } from "@/components/PageHeader";
import { SupabaseGate } from "@/components/SupabaseGate";
import { getReservationById } from "@/lib/queries/reservations";

type PageProps = {
  params: Promise<{ id: string }>;
};

const DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: "reservation_id", label: "予約ID" },
  { key: "status", label: "ステータス" },
  { key: "channel", label: "予約経路" },
  { key: "representative_name", label: "代表者名" },
  { key: "email", label: "メール" },
  { key: "phone", label: "電話" },
  { key: "check_in", label: "チェックイン" },
  { key: "check_out", label: "チェックアウト" },
  { key: "nights", label: "泊数" },
  { key: "guest_total", label: "宿泊人数" },
  { key: "assignment_status", label: "割当状況" },
  { key: "meal", label: "食事" },
  { key: "bbq", label: "BBQ" },
  { key: "arrival_time", label: "到着時間" },
  { key: "transport", label: "交通手段" },
  { key: "address", label: "住所" },
  { key: "inquiry", label: "お問い合わせ" },
  { key: "internal_memo", label: "内部メモ" },
  { key: "import_source", label: "取込元" },
  { key: "access_key", label: "外部受付キー" },
];

export default async function ReservationDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <SupabaseGate>
      <AppShell>
        <DetailContent id={decodeURIComponent(id)} />
      </AppShell>
    </SupabaseGate>
  );
}

async function DetailContent({ id }: { id: string }) {
  const { reservation, error } = await getReservationById(id);

  if (error) return <ConnectionError message={error} />;
  if (!reservation) notFound();

  const record = reservation as Record<string, unknown>;

  return (
    <>
      <div className="mb-4">
        <Link href="/reservations" className="text-sm text-zinc-500 hover:underline">
          ← 一覧に戻る
        </Link>
      </div>

      <PageHeader
        title={String(record.representative_name || record.reservation_id)}
        description={String(record.reservation_id)}
      />

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        読み取り専用（Phase 1）
      </div>

      <dl className="mt-6 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {DETAIL_FIELDS.map(({ key, label }) => {
          const value = record[key];
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
    </>
  );
}
