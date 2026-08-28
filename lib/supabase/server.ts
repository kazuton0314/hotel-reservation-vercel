import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { resolveSupabaseServiceRoleKey } from "@/lib/supabase/read";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component からは cookie 書き込み不可
          }
        },
      },
    }
  );
}

/** 同期・CSV インポート用（service role） */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = resolveSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY が未設定です");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** スタッフ操作（Server Actions）。SKIP_AUTH 開発時は service role にフォールバック */
export async function createStaffClient() {
  if (process.env.SKIP_AUTH === "true" && resolveSupabaseServiceRoleKey()) {
    return createAdminClient();
  }
  return createClient();
}
