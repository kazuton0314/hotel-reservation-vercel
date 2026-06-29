import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ConnectionError } from "@/components/SetupRequired";
import { PageHeader } from "@/components/PageHeader";
import { RequestListRow } from "@/components/requests/RequestListRow";
import { SupabaseGate } from "@/components/SupabaseGate";
import {
  getRequests,
  getRequestStats,
  REQUEST_STATUS_OPTIONS,
} from "@/lib/queries/requests";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    scope?: string;
    q?: string;
  }>;
};

export default async function RequestsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <SupabaseGate>
      <AppShell>
        <Suspense fallback={<p className="text-sm text-zinc-500">読み込み中…</p>}>
          <RequestsContent params={params} />
        </Suspense>
      </AppShell>
    </SupabaseGate>
  );
}

async function RequestsContent({
  params,
}: {
  params: { status?: string; scope?: string; q?: string };
}) {
  const scope = params.scope === "all" ? "all" : "upcoming";
  const [stats, { requests, error }] = await Promise.all([
    getRequestStats(),
    getRequests({
      status: params.status || undefined,
      scope,
      q: params.q || undefined,
    }),
  ]);

  if (error) {
    return <ConnectionError message={error} />;
  }

  return (
    <>
      <PageHeader
        title="リクエスト一覧"
        description={`${requests.length} 件（承認・却下・本予約連携を管理）`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="未処理" value={stats.pendingCount} />
        <Stat label="承認済" value={stats.approvedCount} />
        <Stat label="却下" value={stats.rejectedCount} />
        <Stat label="連携済" value={stats.linkedCount} />
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
            {REQUEST_STATUS_OPTIONS.map((s) => (
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

        <label className="min-w-52 text-sm">
          <span className="mb-1 block text-zinc-500">検索</span>
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="ID / 代表者名 / メール"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
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
        {requests.map((item) => (
          <li key={item.request_id}>
            <RequestListRow item={item} />
          </li>
        ))}
      </ul>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          リクエストがありません。フォーム取込を実行してください。
        </p>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
