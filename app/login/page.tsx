import { LoginForm } from "@/components/auth/LoginForm";
import { SetupRequired } from "@/components/SetupRequired";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const nextRaw = sp.next;
  const nextPath =
    (Array.isArray(nextRaw) ? nextRaw[0] : nextRaw)?.trim() || "/";
  const reasonRaw = sp.reason;
  const reason = Array.isArray(reasonRaw) ? reasonRaw[0] : reasonRaw;

  if (!isSupabaseConfigured()) {
    return (
      <main className="main" style={{ paddingTop: 24 }}>
        <SetupRequired />
      </main>
    );
  }

  return (
    <main className="main" style={{ paddingTop: 24, maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: 16 }}>みどりの時計台 予約管理</h1>
      <LoginForm nextPath={nextPath} sessionNotice={sessionNoticeForReason(reason)} />
    </main>
  );
}

function sessionNoticeForReason(reason: string | undefined): string | null {
  if (reason === "session_invalid") {
    return "ログインセッションが無効になりました。端末の日付・時刻を自動設定にしてから、再度ログインしてください。";
  }
  return null;
}
