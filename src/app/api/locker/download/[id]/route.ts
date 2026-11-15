import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { INLINE_SAFE_MIME } from "@/lib/locker/config";
import { verifyFileSignature } from "@/lib/locker/signing";
import { storage } from "@/lib/locker/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user.emailVerified) return new NextResponse("Not signed in", { status: 401 });
  const sp = req.nextUrl.searchParams;
  if (!verifyFileSignature(id, session.userId, sp.get("exp") ?? "", sp.get("d") ?? "", sp.get("sig") ?? "")) {
    return new NextResponse("This link has expired. Reload the page to get a new one.", { status: 403 });
  }
  const file = await db.storedFile.findFirst({ where: { id, userId: session.userId, deletedAt: null } });
  if (!file || file.status === "FAILED") return new NextResponse("Not found", { status: 404 });
  if (file.sensitive && !(session.elevatedUntil && session.elevatedUntil > new Date())) {
    return new NextResponse("Confirm your password to open sensitive files.", { status: 403 });
  }

  const inline = sp.get("d") === "inline" && INLINE_SAFE_MIME.has(file.mimeType);
  const total = Number(file.sizeBytes);
  const headers = new Headers({
    "Content-Type": inline ? `${file.mimeType}${file.mimeType.startsWith("text/") ? "; charset=utf-8" : ""}` : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.displayName.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.displayName)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  });
  // Uploaded content can never run scripts in our origin. PDFs skip `sandbox` because it disables the
  // browser's built-in viewer, which already runs isolated from the page.
  headers.set(
    "Content-Security-Policy",
    inline && file.mimeType === "application/pdf"
      ? "default-src 'none'; object-src 'self'; frame-ancestors 'self'"
      : "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
  );

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : total - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    return new NextResponse(Readable.toWeb((await storage.read(file.storageKey, { start, end }))) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(total));
  return new NextResponse(Readable.toWeb((await storage.read(file.storageKey))) as ReadableStream, { headers });
}
