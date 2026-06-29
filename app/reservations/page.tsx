import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ConnectionError } from "@/components/SetupRequired";
import { PageHeader } from "@/components/PageHeader";
import { ReservationListRow } from "@/components/reservations/ReservationListRow";
import { SupabaseGate } from "@/components/SupabaseGate";
import { getReservations } from "@/lib/queries/reservations";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    scope?: string;
  }>;
};

const STATUS_OPTIONS = ["", "仮予約", "確定", "キャンセル"];

export default async function ReservationsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <SupabaseGate>
      <AppShell>
        <Suspense fallback={<p className="text-sm text-zinc-500">読み込み中…</p>}>
          <ReservationsContent params={params} />
        </Suspense>
      </AppShell>
    </SupabaseGate>
  );
}

async function ReservationsContent({
  params,
}: {
  params: { status?: string; scope?: string };
}) {
  const scope = params.scope === "all" ? "all" : "upcoming";
  const { reservations, error } = await getReservations({
    status: params.status || undefined,
    scope,
  });

  if (error) {
    return <ConnectionError message={error} />;
  }

  return (
    <>
      <PageHeader
        title="本予約一覧"
        description={`${reservations.length} 件（読み取り専用）`}
      />

      <form className="mb-6 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">ステータス</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">すべて</option>
            {STATUS_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">期間</span>
          <select
            name="scope"
            defaultValue={scope}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="upcoming">今後</option>
            <option value="all">すべて</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            絞り込み
          </button>
        </div>
      </form>

      <ul className="space-y-3">
        {reservations.map((item) => (
          <li key={item.reservation_id}>
            <ReservationListRow item={item} />
          </li>
        ))}
      </ul>

      {reservations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          予約がありません。初期CSVの投入またはフォーム取込を実行してください。
        </p>
      ) : null}
    </>
  );
}
