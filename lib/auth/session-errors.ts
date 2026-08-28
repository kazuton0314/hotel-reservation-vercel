/** Supabase Auth / PostgREST の JWT セッションエラー判定 */
export function isJwtSessionError(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("jwt") ||
    (lower.includes("token") && lower.includes("expired")) ||
    lower.includes("issued at future") ||
    lower.includes("issued in the future") ||
    lower.includes("invalid claim") ||
    lower.includes("bad_jwt")
  );
}

export function jwtSessionErrorMessage(message: string): string {
  if (!isJwtSessionError(message)) return message;
  return (
    "ログインセッションの有効期限切れ、または端末の時刻ずれの可能性があります。" +
    "一度ログアウトして再ログインしてください。パソコン・スマホの「日付と時刻を自動設定」もご確認ください。"
  );
}
