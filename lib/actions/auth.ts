"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";
import { createClient } from "@/lib/supabase/server";

export async function signInAction(
  _prev: { ok: false; message: string } | null,
  formData: FormData
): Promise<{ ok: false; message: string } | null> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = resolvePostLoginPath(String(formData.get("next") ?? "/"));

  if (!email || !password) {
    return { ok: false, message: "メールアドレスとパスワードを入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: "ログインに失敗しました。認証情報を確認してください。" };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
