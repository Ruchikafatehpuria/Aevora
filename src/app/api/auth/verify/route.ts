import { NextResponse, type NextRequest } from "next/server";
import { markEmailVerified } from "@/lib/auth/verify";
import { consumeToken } from "@/lib/auth/tokens";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = token ? await consumeToken(token, "EMAIL_VERIFICATION") : null;
  if (!userId) {
    return NextResponse.redirect(new URL("/verify-email?status=invalid", req.url));
  }
  await markEmailVerified(userId);
  const current = await getCurrentUser();
  const dest = current?.id === userId ? "/overview?welcome=1" : "/login?verified=1";
  return NextResponse.redirect(new URL(dest, req.url));
}
