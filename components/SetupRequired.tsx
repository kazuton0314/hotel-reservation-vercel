export function SetupRequired() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <h1 className="text-xl font-bold text-zinc-900">環境変数の設定が必要です</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-700">
        プロジェクト直下に <code className="rounded bg-white px-1">.env.local</code>{" "}
        を作成し、Supabase の URL とキーを設定してください。
      </p>
    </section>
  );
}

export function ConnectionError({ message }: { message: string }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold text-red-900">接続エラー</h2>
      <p className="mt-2 text-sm text-red-800">{message}</p>
    </section>
  );
}
