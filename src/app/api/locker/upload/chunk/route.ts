import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { limits } from "@/lib/locker/config";
import { CHUNK_BYTES, isUploadId, saveChunk } from "@/lib/locker/chunks";
import { SizeLimitError } from "@/lib/locker/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Receives one piece of a large file. The final POST to /api/locker/upload joins them. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.emailVerified) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const uploadId = req.headers.get("x-upload-id");
  const index = Number(req.headers.get("x-chunk-index"));
  const maxChunks = Math.ceil(limits.maxUploadBytes / CHUNK_BYTES);
  if (!isUploadId(uploadId) || !Number.isInteger(index) || index < 0 || index >= maxChunks || !req.body) {
    return NextResponse.json({ error: "Invalid upload piece" }, { status: 400 });
  }
  if (!(await rateLimit(`chunk:${user.id}`, 5000, 3600))) return NextResponse.json({ error: "Upload rate limit reached. Try again later." }, { status: 429 });
  try {
    const size = await saveChunk(user.id, uploadId, index, Readable.fromWeb(req.body as unknown as WebReadableStream));
    return NextResponse.json({ ok: true, size });
  } catch (e) {
    if (e instanceof SizeLimitError) return NextResponse.json({ error: "Upload piece too large" }, { status: 413 });
    console.error("Chunk upload failed", e);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
