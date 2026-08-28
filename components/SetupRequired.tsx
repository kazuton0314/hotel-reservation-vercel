import { jwtSessionErrorMessage } from "@/lib/auth/session-errors";

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
  const displayMessage = jwtSessionErrorMessage(message);
  const isSessionIssue = displayMessage !== message;

  return (
    <section className="detail-block">
      <h3>{isSessionIssue ? "ログインセッションエラー" : "接続エラー"}</h3>
      <p className="detail-hint" style={{ color: "#b91c1c" }}>
        {displayMessage}
      </p>
      {isSessionIssue ? (
        <p className="form-hint" style={{ marginTop: 12 }}>
          ヘッダーの「ログアウト」から一度サインアウトし、再ログインしてください。
        </p>
      ) : null}
    </section>
  );
}
