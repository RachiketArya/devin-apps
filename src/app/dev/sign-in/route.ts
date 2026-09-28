import { NextRequest, NextResponse } from "next/server";
import { db } from "@/platform/db";
import { encodeSession, SESSION_COOKIE } from "@/platform/auth/session";
import { getIdentityProvider } from "@/platform/auth";

/**
 * Dev-only one-step sign-in for automated browser checks:
 *   GET /dev/sign-in?email=analyst@dev.local[&next=/kyc]
 * Disabled entirely in production and whenever the dev provider is not active.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const provider = getIdentityProvider();
  if (provider.key !== "dev") {
    return new NextResponse("Not found", { status: 404 });
  }

  const email = request.nextUrl.searchParams.get("email");
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  if (!email) return new NextResponse("email required", { status: 400 });

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return new NextResponse("unknown user", { status: 404 });

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(SESSION_COOKIE, encodeSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
