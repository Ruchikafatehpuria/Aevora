import { NextResponse, after, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { limits } from "@/lib/locker/config";
import { IngestError, ingestStream } from "@/lib/locker/ingest";
import { errorReason } from "@/lib/locker/imports";
import { runPendingJobs } from "@/lib/locker/jobs";

export const runtime = "nodejs";

const meta = z.object({
  title: z.string().trim().min(1).max(150),
  sensitive: z.boolean(),
  ocrPages: z.array(z.string().max(50_000)).max(100),
});

/** Saves a camera scan (PDF or image) built in the browser, with its client-side OCR text. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await rateLimit(`upload:${user.id}`, 1000, 3600))) return NextResponse.json({ error: "Upload rate limit reached." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > limits.maxUploadBytes + 1_000_000) {
    return NextResponse.json({ error: "Scan is too large" }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const parsed = meta.safeParse(JSON.parse(String(form?.get("meta") ?? "null")));
  if (!(file instanceof File) || !parsed.success) return NextResponse.json({ error: "Invalid scan" }, { status: 400 });

  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : null;
  if (!ext) return NextResponse.json({ error: "Scans must be PDF or JPEG" }, { status: 422 });
  const safeTitle = parsed.data.title.replace(/[\\/:*?"<>|]/g, "-");
  const pages = parsed.data.ocrPages.map((p) => p.trim());
  const text = pages.join("\n\n").trim();

  try {
    const batch = await db.importBatch.create({ data: { userId: user.id, kind: "FILES", source: "CAMERA_SCAN", label: safeTitle } });
    const { file: stored, duplicateOf } = await ingestStream({
      userId: user.id,
      input: Readable.fromWeb(file.stream() as unknown as WebReadableStream),
      name: `${safeTitle}.${ext}`,
      source: "CAMERA_SCAN",
      sourceDetail: text ? "Scanned with the camera; text read on your device (OCR)" : "Scanned with the camera",
      batchId: batch.id,
      sensitive: parsed.data.sensitive,
      extracted: text ? { text, pages: ext === "pdf" ? pages : undefined } : null,
    });
    after(() => runPendingJobs(10).catch(console.error));
    return NextResponse.json({ id: stored.id, duplicate: !!duplicateOf });
  } catch (e) {
    const status = e instanceof IngestError ? (e.code === "quota" ? 507 : e.code === "too_large" ? 413 : 422) : 500;
    return NextResponse.json({ error: errorReason(e) }, { status });
  }
}
