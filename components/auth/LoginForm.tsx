"use client";

import { useActionState } from "react";
import { signInAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({
  nextPath,
  sessionNotice,
}: {
  nextPath: string;
  sessionNotice?: string | null;
}) {
  const [state, formAction, pending] = useActionState(signInAction, null);

  return (
    <form action={formAction} className="detail-block">
      <h3>スタッフログイン</h3>
      {sessionNotice ? (
        <p className="detail-hint" style={{ color: "#b45309", marginBottom: 12 }}>
          {sessionNotice}
        </p>
      ) : null}
      <input type="hidden" name="next" value={nextPath} />
      <div className="form-group">
        <label htmlFor="login-email">メールアドレス</label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="login-password">パスワード</label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </Button>
    </form>
  );
}
