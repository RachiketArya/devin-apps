import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/platform/auth/session";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
