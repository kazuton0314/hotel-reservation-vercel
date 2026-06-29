import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { SupabaseGate } from "@/components/SupabaseGate";
import { runAllDiagnostics } from "@/lib/setup/diagnostics";
import {
  getServiceAccountEmailForSharing,
  getSetupChecks,
  TEST_SPREADSHEET_URLS,
} from "@/lib/setup/env";

export default async function SetupPage() {
  return (
    <SupabaseGate>
      <AppShell>
        <SetupContent />
      </AppShell>
    </SupabaseGate>
  );
}

async function SetupContent() {
  const checks = getSetupChecks();
  const saEmail = getServiceAccountEmailForSharing();
  const diagnostics = await runAllDiagnostics();
  const googleReady = checks
    .filter((c) => c.id === "google_sa_email" || c.id === "google_sa_key")
    .every((c) => c.ok);

  return (
    <>
      <PageHeader
        title="セットアップ"
        description="環境変数と接続状態の確認。秘密情報は表示しません。"
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">環境変数</h2>
        <ul className="mt-3 space-y-2">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <span
                className={
                  c.ok ? "font-bold text-emerald-600" : "font-bold text-red-600"
                }
              >
                {c.ok ? "✓" : "✗"}
              </span>
              <div>
                <p className="font-medium">{c.label}</p>
                <p className="text-zinc-600">{c.detail}</p>
                {!c.ok && c.userAction ? (
                  <p className="mt-0.5 text-xs text-amber-800">{c.userAction}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {saEmail ? (
        <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900">
            スプシ共有用メール（コピーして閲覧者に追加）
          </h2>
          <p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm">
            {saEmail}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <a
                href={TEST_SPREADSHEET_URLS.booking}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-800 underline"
              >
                本予約テストスプシを開く
              </a>
            </li>
            <li>
              <a
                href={TEST_SPREADSHEET_URLS.request}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-800 underline"
              >
                リクエストテストスプシを開く
              </a>
            </li>
          </ul>
        </section>
      ) : (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p>
            サービスアカウント作成後、{" "}
            <code className="rounded bg-white px-1">GOOGLE_SERVICE_ACCOUNT_EMAIL</code>{" "}
            を設定すると、共有用メールがここに表示されます。
          </p>
          <p className="mt-2">
            手順:{" "}
            <code className="rounded bg-white px-1">docs/SETUP-YOUR-TASKS.md</code>
          </p>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">接続テスト</h2>
        <ul className="mt-3 space-y-2">
          {diagnostics.map((d) => (
            <li key={d.name} className="flex items-start gap-2 text-sm">
              <span
                className={
                  d.ok ? "font-bold text-emerald-600" : "font-bold text-red-600"
                }
              >
                {d.ok ? "✓" : "✗"}
              </span>
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-zinc-600">{d.message}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm">
        <h2 className="font-semibold">次のコマンド</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-xs">
          npm run check:setup{"\n"}
          {googleReady ? "npm run sync:forms" : "# ↑ Google 設定後に実行"}
        </pre>
        <p className="mt-3 text-zinc-600">
          テストデータの貼り付け:{" "}
          <code className="rounded bg-white px-1">data/test-forms/</code>
        </p>
        <Link
          href="/settings/sync"
          className="mt-3 inline-block font-medium text-emerald-700 hover:underline"
        >
          同期ステータスへ →
        </Link>
      </section>
    </>
  );
}
