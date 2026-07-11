export function SetupRequired() {
  return (
    <section className="detail-block">
      <h3>環境変数の設定が必要です</h3>
      <p className="form-hint">
        プロジェクト直下に <code>.env.local</code> を作成し、Supabase の URL
        とキーを設定してください。
      </p>
    </section>
  );
}

export function ConnectionError({ message }: { message: string }) {
  return (
    <section className="detail-block">
      <h3>接続エラー</h3>
      <p className="detail-hint" style={{ color: "#b91c1c" }}>
        {message}
      </p>
    </section>
  );
}
