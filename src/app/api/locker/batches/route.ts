import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

const body = z.object({ source: z.enum(["MANUAL_UPLOAD", "WHATSAPP"]), label: z.string().max(120).optional() });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const batch = await db.importBatch.create({
    data: { userId: user.id, kind: "FILES", source: parsed.data.source, label: parsed.data.label ?? null },
  });
  return NextResponse.json({ id: batch.id });
}
