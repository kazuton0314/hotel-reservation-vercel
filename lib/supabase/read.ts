import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";

/**
 * サーバー側の読み取り用クライアント。
 * - service_role があればそれを使用（Cron / キャッシュ）
 * - なければログインセッション付きクライアント（004 RLS 後は anon では読めない）
 */
export async function createReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && serviceKey) {
    return createSupabaseClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createAuthClient();
}
