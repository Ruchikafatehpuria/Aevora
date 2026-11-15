import { NextResponse, after, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { extensionOf, limits } from "@/lib/locker/config";
import { IngestError, ingestStream, sanitizeName } from "@/lib/locker/ingest";
import { errorReason, importChatText, importZip, type ImportResult } from "@/lib/locker/imports";
import { runPendingJobs } from "@/lib/locker/jobs";
import { streamToBuffer } from "@/lib/locker/zip";
import { assembledUpload, discardUpload, isUploadId, purgeStaleChunks } from "@/lib/locker/chunks";

export const runtime = "nodejs";
export const maxDuration = 300;

async function recordFailure(batchId: string | null, userId: string, name: string, reason: string) {
  if (!batchId) return;
  const batch = await db.importBatch.findFirst({ where: { id: batchId, userId } });
  if (!batch) return;
  const failures = [...((batch.failures as { name: string; reason: string }[] | null) ?? []), { name, reason }];
  await db.importBatch.update({ where: { id: batchId }, data: { failures: failures as Prisma.InputJsonValue, failedCount: failures.length } });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Large files arrive as pieces (see /api/locker/upload/chunk); this request then carries no body.
  const uploadId = req.headers.get("x-upload-id");
  const chunked = isUploadId(uploadId);
  if (!chunked && !req.body) return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  if (!(await rateLimit(`upload:${user.id}`, 1000, 3600))) {
    return NextResponse.json({ error: "Upload rate limit reached. Try again later." }, { status: 429 });
  }

  const name = sanitizeName(decodeURIComponent(req.headers.get("x-file-name") ?? "file"));
  const source = req.headers.get("x-source") === "WHATSAPP" ? "WHATSAPP" : "MANUAL_UPLOAD";
  const zipMode = req.headers.get("x-zip-mode") === "keep" ? "keep" : "extract";
  const relPath = req.headers.get("x-relative-path") ? decodeURIComponent(req.headers.get("x-relative-path")!) : null;
  const batchHeader = req.headers.get("x-batch-id");
  const batch = batchHeader ? await db.importBatch.findFirst({ where: { id: batchHeader, userId: user.id } }) : null;
  const ext = extensionOf(name);
  let body: Readable;
  let declared: number;
  if (chunked) {
    const assembled = await assembledUpload(user.id, uploadId, Number(req.headers.get("x-chunk-total")));
    if (!assembled) {
      await recordFailure(batch?.id ?? null, user.id, name, "Upload was incomplete. Please try again.");
      return NextResponse.json({ error: "Upload was incomplete. Please try again." }, { status: 400 });
    }
    body = assembled.stream;
    declared = assembled.size;
  } else {
    body = Readable.fromWeb(req.body as unknown as WebReadableStream);
    declared = Number(req.headers.get("content-length") ?? 0);
  }
  const cleanup = () => {
    if (chunked) after(() => discardUpload(user.id, uploadId).catch(() => {}));
  };
  after(() => purgeStaleChunks().catch(() => {}));

  if (declared > limits.maxUploadBytes) {
    cleanup();
    body.resume();
    const reason = `File exceeds the ${Math.round(limits.maxUploadBytes / 1048576)} MB limit`;
    await recordFailure(batch?.id ?? null, user.id, name, reason);
    return NextResponse.json({ error: reason }, { status: 413 });
  }

  try {
    let result: ImportResult;
    if (ext === "zip" && zipMode === "extract") {
      const tmp = path.join(tmpdir(), `syncly-${randomUUID()}.zip`);
      try {
        let size = 0;
        const cap = new Transform({
          transform(c: Buffer, _e, cb) {
            size += c.length;
            cb(size > limits.maxUploadBytes ? new IngestError("ZIP exceeds the upload size limit", "too_large") : null, c);
          },
        });
        await pipeline(body, cap, createWriteStream(tmp, { mode: 0o600 }));
        result = await importZip(user.id, tmp, name, source);
      } finally {
        await rm(tmp, { force: true });
      }
    } else if (ext === "txt") {
      const buf = await streamToBuffer(body, limits.maxUploadBytes);
      result = (await importChatText(user.id, buf, name)) ?? { imported: [], failed: [] };
      if (!result.archiveId) {
        const { file, duplicateOf } = await ingestStream({ userId: user.id, input: Readable.from(buf), name, source, batchId: batch?.id, originalPath: relPath });
        result.imported.push({ id: file.id, name, duplicate: !!duplicateOf });
      }
    } else {
      const { file, duplicateOf } = await ingestStream({ userId: user.id, input: body, name, source, batchId: batch?.id, originalPath: relPath });
      result = { imported: [{ id: file.id, name, duplicate: !!duplicateOf }], failed: [] };
    }
    cleanup();
    after(() => runPendingJobs(100).catch((e) => console.error("Background processing failed", e)));
    return NextResponse.json(result);
  } catch (e) {
    cleanup();
    const reason = errorReason(e);
    await recordFailure(batch?.id ?? null, user.id, name, reason);
    const status = e instanceof IngestError ? (e.code === "too_large" ? 413 : e.code === "quota" ? 507 : 422) : 500;
    return NextResponse.json({ error: reason }, { status });
  }
}
