import { NextResponse, after, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { ingestStream } from "@/lib/locker/ingest";
import { errorReason } from "@/lib/locker/imports";
import { runPendingJobs } from "@/lib/locker/jobs";

export const runtime = "nodejs";

/** Receives files from the OS share sheet (PWA Web Share Target, Android/Chromium). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.emailVerified) {
    return NextResponse.redirect(new URL("/login?next=/locker/upload&share=expired", req.url), 303);
  }
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.redirect(new URL("/locker/upload?share=empty", req.url), 303);

  const batch = await db.importBatch.create({ data: { userId: user.id, kind: "SHARE", source: "SHARE_SHEET", label: "Shared from device" } });
  const failures: { name: string; reason: string }[] = [];
  let saved = 0;
  for (const f of files) {
    try {
      await ingestStream({
        userId: user.id,
        input: Readable.fromWeb(f.stream() as unknown as WebReadableStream),
        name: f.name,
        source: "SHARE_SHEET",
        sourceDetail: "Shared from the device share menu",
        batchId: batch.id,
      });
      saved++;
    } catch (e) {
      failures.push({ name: f.name, reason: errorReason(e) });
    }
  }
  if (failures.length) await db.importBatch.update({ where: { id: batch.id }, data: { failures, failedCount: failures.length } });
  after(() => runPendingJobs(50).catch(console.error));
  return NextResponse.redirect(new URL(`/locker/inbox?shared=${saved}&failed=${failures.length}`, req.url), 303);
}
