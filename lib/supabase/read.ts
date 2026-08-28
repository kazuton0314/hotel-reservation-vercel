import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";

/** Vercel 等で SUPABASE_SECRET_KEY 名になっている場合も拾う */
export function resolveSupabaseServiceRoleKey(): string | null {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();
  return key || null;
}

/**
 * サーバー側の読み取り用クライアント。
 * - service_role があればそれを使用（Cron / キャッシュ）
 * - なければログインセッション付きクライアント（004 RLS 後は anon では読めない）
 */
export async function createReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = resolveSupabaseServiceRoleKey();

  if (url && serviceKey) {
    return createSupabaseClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createAuthClient();
}
