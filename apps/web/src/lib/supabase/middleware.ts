import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptionsWithName } from "@supabase/ssr";

/**
 * Refreshes the Supabase auth session cookie on every request. Called from
 * src/proxy.ts (Next.js 16 renamed the middleware.ts convention to proxy.ts).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options: CookieOptionsWithName }[]) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Must call getUser() (not getSession()) so an expired token is actually refreshed here.
  const { data: { user } } = await supabase.auth.getUser();

  // Only the director home page requires a session; public org/tournament pages and the API stay open.
  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/auth");
  if (!user && path === "/" && !isAuthRoute) return NextResponse.redirect(new URL("/login", request.url));

  return response;
}
