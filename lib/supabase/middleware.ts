import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isJwtSessionError } from "@/lib/auth/session-errors";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/companions"];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (pathname.startsWith("/api/cron/")) return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  if (pathname.startsWith("/api/companions/")) return true;
  return false;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const skipAuth = process.env.SKIP_AUTH === "true";

  if (
    !skipAuth &&
    authError &&
    isJwtSessionError(authError.message) &&
    !isPublicPath(pathname)
  ) {
    await supabase.auth.signOut();
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("reason", "session_invalid");
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!skipAuth && !user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const next = resolvePostLoginPath(request.nextUrl.searchParams.get("next"));
    const redirectUrl = request.nextUrl.clone();
    const q = next.indexOf("?");
    if (q >= 0) {
      redirectUrl.pathname = next.slice(0, q) || "/";
      redirectUrl.search = next.slice(q);
    } else {
      redirectUrl.pathname = next;
      redirectUrl.search = "";
    }
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
