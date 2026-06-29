import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SupabaseGate } from "@/components/SupabaseGate";
import {
  getFormImportCounts,
  getRecentSyncRuns,
  getReservationStats,
} from "@/lib/queries/reservations";

export default async function HomePage() {
  return (
    <SupabaseGate>
      <AppShell>
        <HomeContent />
      </AppShell>
    </SupabaseGate>
  );
}

async function HomeContent() {
  const [stats, importCounts, { runs }] = await Promise.all([
    getReservationStats(),
    getFormImportCounts(),
    getRecentSyncRuns(1),
  ]);

  const lastRun = runs[0];

  return (
    <>
      <PageHeader
        title="ダッシュボード"
        description="Phase 1: 読み取り専用。データはフォーム取込 + 初期CSVから構築されます。"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="アクティブ予約" value={stats.activeCount} />
        <StatCard label="今後の予約" value={stats.upcomingCount} />
        <StatCard label="未割当" value={stats.unassignedCount} />
      </div>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">フォーム取込状況</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-zinc-500">本予約フォーム</dt>
            <dd className="text-lg font-semibold">{importCounts.studio} 行</dd>
          </div>
          <div>
            <dt className="text-zinc-500">予約リクエスト</dt>
            <dd className="text-lg font-semibold">{importCounts.request} 行</dd>
          </div>
        </dl>
        {lastRun ? (
          <p className="mt-4 text-xs text-zinc-500">
            最終同期: {new Date(lastRun.started_at).toLocaleString("ja-JP")}（
            {lastRun.status}）
          </p>
        ) : (
          <p className="mt-4 text-xs text-zinc-500">
            まだ同期が実行されていません
          </p>
        )}
        <Link
          href="/settings/sync"
          className="mt-4 inline-block text-sm font-medium text-emerald-700 hover:underline"
        >
          同期設定を見る →
        </Link>
      </section>

      <section className="mt-6">
        <Link
          href="/reservations"
          className="block rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 hover:bg-emerald-100"
        >
          <p className="font-semibold">本予約一覧を開く</p>
          <p className="mt-1 text-sm opacity-80">ステータス・日付で絞り込み（読み取り専用）</p>
        </Link>
      </section>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
