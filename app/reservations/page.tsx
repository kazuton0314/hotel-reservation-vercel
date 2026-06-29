import Link from "next/link";
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
    assignment?: string;
    mail?: string;
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
  params: {
    status?: string;
    scope?: string;
    assignment?: string;
    mail?: string;
  };
}) {
  const scopeParam = params.scope ?? "upcoming";
  const scope =
    scopeParam === "archived"
      ? "archived"
      : scopeParam === "all"
        ? "all"
        : "upcoming";
  const { reservations, error } = await getReservations({
    status: params.status || undefined,
    scope: scope === "archived" ? "all" : scope,
    includeArchived: scope === "archived",
    assignment: params.assignment === "unassigned" ? "unassigned" : undefined,
    mailPending: params.mail === "pending",
  });

  const visible =
    scope === "archived"
      ? reservations.filter((r) => r.is_archived)
      : reservations.filter((r) => !r.is_archived);

  if (error) {
    return <ConnectionError message={error} />;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <PageHeader
          title="本予約一覧"
          description={`${visible.length} 件`}
        />
        <Link
          href="/reservations/new"
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
        >
          + 手動作成
        </Link>
      </div>

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
          <span className="mb-1 block text-zinc-500">表示</span>
          <select
            name="scope"
            defaultValue={scope}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="upcoming">今後（アクティブ）</option>
            <option value="all">すべて（アクティブ）</option>
            <option value="archived">アーカイブのみ</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">部屋割</span>
          <select
            name="assignment"
            defaultValue={params.assignment ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">すべて</option>
            <option value="unassigned">未割当のみ</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">メール</span>
          <select
            name="mail"
            defaultValue={params.mail ?? ""}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">すべて</option>
            <option value="pending">完了メール未送付</option>
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
        {visible.map((item) => (
          <li key={item.reservation_id}>
            <ReservationListRow item={item} />
          </li>
        ))}
      </ul>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          予約がありません。初期CSVの投入またはフォーム取込を実行してください。
        </p>
      ) : null}
    </>
  );
}
