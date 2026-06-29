import { AppShell } from "@/components/AppShell";
import { ConnectionError } from "@/components/SetupRequired";
import { PageHeader } from "@/components/PageHeader";
import { SupabaseGate } from "@/components/SupabaseGate";
import {
  getFormImportCounts,
  getRecentSyncRuns,
} from "@/lib/queries/reservations";

export default async function SyncSettingsPage() {
  return (
    <SupabaseGate>
      <AppShell>
        <SyncContent />
      </AppShell>
    </SupabaseGate>
  );
}

async function SyncContent() {
  const [importCounts, { runs, error }] = await Promise.all([
    getFormImportCounts(),
    getRecentSyncRuns(20),
  ]);

  if (error) return <ConnectionError message={error} />;

  return (
    <>
      <PageHeader
        title="同期ステータス"
        description="フォーム回答スプシ → Supabase（予約管理DBは参照・初期CSVのみ）"
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">データソース</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-700">
          <li>
            <span className="font-medium">本予約フォーム</span>
            <span className="ml-2 text-zinc-500">（回答スプシを直接読み取り）</span>
          </li>
          <li>
            <span className="font-medium">予約リクエストフォーム</span>
            <span className="ml-2 text-zinc-500">（回答スプシを直接読み取り）</span>
          </li>
          <li>
            <span className="font-medium">予約管理DB</span>
            <span className="ml-2 text-zinc-500">
              初期CSVインポートのみ（日常同期なし）
            </span>
          </li>
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">取込済み行数</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-zinc-500">本予約</dt>
            <dd className="text-xl font-bold">{importCounts.studio}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">リクエスト</dt>
            <dd className="text-xl font-bold">{importCounts.request}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">同期履歴</h2>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">履歴がありません</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {runs.map((run) => (
              <li key={run.id} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{run.job_name}</span>
                  <span
                    className={
                      run.status === "success"
                        ? "text-emerald-700"
                        : run.status === "error"
                          ? "text-red-700"
                          : "text-zinc-500"
                    }
                  >
                    {run.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {new Date(run.started_at).toLocaleString("ja-JP")}
                  {run.rows_imported != null
                    ? ` · 取込 ${run.rows_imported} / スキップ ${run.rows_skipped ?? 0}`
                    : ""}
                </p>
                {run.error_message ? (
                  <p className="mt-1 text-xs text-red-600">{run.error_message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        <h2 className="font-semibold text-zinc-900">手動実行</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-xs">
          npm run sync:forms
        </pre>
        <p className="mt-3">
          Vercel 本番では 5 分ごとに <code>/api/cron/sync-forms</code> が実行されます。
        </p>
      </section>
    </>
  );
}
