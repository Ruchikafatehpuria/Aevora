import "server-only";
import type { Readable } from "node:stream";
import type { FileSource } from "@prisma/client";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/lib/db";
import { EXTENSIONS, WHATSAPP_FILENAME, extensionOf, limits } from "./config";
import { SizeLimitError, storage } from "./storage";

export class IngestError extends Error {
  constructor(message: string, readonly code: "unsupported_type" | "too_large" | "quota" | "content_mismatch" | "empty") {
    super(message);
  }
}

/** Sniffed file-type extensions that are acceptable for each declared extension. */
const SNIFF_OK: Record<string, string[]> = {
  pdf: ["pdf"],
  docx: ["docx", "zip"], xlsx: ["xlsx", "zip"], pptx: ["pptx", "zip"],
  odt: ["odt", "zip"], ods: ["ods", "zip"], odp: ["odp", "zip"],
  doc: ["cfb", "doc"], xls: ["cfb", "xls"], ppt: ["cfb", "ppt"],
  zip: ["zip"],
  jpg: ["jpg"], jpeg: ["jpg"], png: ["png"], webp: ["webp"], gif: ["gif"], heic: ["heic"],
  mp4: ["mp4", "m4v", "mov", "3gp"], mov: ["mov", "mp4"], "3gp": ["3gp", "mp4"], webm: ["webm"],
  mp3: ["mp3"], m4a: ["m4a", "mp4"], aac: ["aac"], ogg: ["ogg", "opus", "oga"], opus: ["opus", "ogg", "oga"], wav: ["wav"],
  rtf: ["rtf"],
};
/** Types whose content we never accept, regardless of the name they arrive with. */
const DANGEROUS = new Set(["exe", "elf", "macho", "msi", "dmg", "apk", "dll", "class", "wasm", "deb", "rpm", "lnk", "swf"]);

export function sanitizeName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 200);
  return clean || "file";
}

export async function storageUsed(userId: string) {
  const agg = await db.storedFile.aggregate({ where: { userId, status: { not: "FAILED" } }, _sum: { sizeBytes: true } });
  return Number(agg._sum.sizeBytes ?? 0);
}

export type IngestInput = {
  userId: string;
  input: Readable;
  name: string;
  source: FileSource;
  sourceDetail?: string | null;
  batchId?: string | null;
  originalPath?: string | null;
  documentDate?: Date | null;
  sensitive?: boolean;
  /** Text already extracted on the client (e.g. OCR of a camera scan). */
  extracted?: { text: string; pages?: string[] } | null;
};

export async function ingestStream(opts: IngestInput) {
  const originalName = sanitizeName(opts.name);
  const ext = extensionOf(originalName);
  const known = EXTENSIONS[ext];
  if (!known) {
    opts.input.resume();
    throw new IngestError(`.${ext || "?"} files aren't supported`, "unsupported_type");
  }

  const remaining = limits.quotaBytes - (await storageUsed(opts.userId));
  if (remaining <= 0) {
    opts.input.resume();
    throw new IngestError("Your storage is full. Delete files to free up space.", "quota");
  }
  const cap = Math.min(limits.maxUploadBytes, remaining);

  let written;
  try {
    written = await storage.write(opts.input, cap);
  } catch (e) {
    if (e instanceof SizeLimitError) {
      throw cap < limits.maxUploadBytes
        ? new IngestError("This file would exceed your storage quota.", "quota")
        : new IngestError(e.message, "too_large");
    }
    throw e;
  }

  try {
    if (written.size === 0) throw new IngestError("The file is empty.", "empty");
    const sniff = await fileTypeFromBuffer(written.head);
    if (sniff && DANGEROUS.has(sniff.ext)) throw new IngestError("This file contains executable content and was rejected.", "content_mismatch");
    const expected = SNIFF_OK[ext];
    if (expected && (!sniff || !expected.includes(sniff.ext))) {
      // Text-like declared types have no magic bytes, so only binary formats are checked strictly.
      throw new IngestError(`The file's contents don't match its .${ext} extension.`, "content_mismatch");
    }
    if (!expected && sniff) {
      // Plain-text types (txt, csv, md, json, vcf) have no signature; binary content claiming to be text is rejected.
      throw new IngestError(`The file's contents don't match its .${ext} extension.`, "content_mismatch");
    }

    let source = opts.source;
    let sourceDetail = opts.sourceDetail ?? null;
    if ((source === "MANUAL_UPLOAD" || source === "SHARE_SHEET") && WHATSAPP_FILENAME.test(originalName)) {
      source = "WHATSAPP";
      sourceDetail = "Detected from WhatsApp's filename pattern";
    }

    const duplicate = await db.storedFile.findFirst({
      where: { userId: opts.userId, sha256: written.sha256, status: { in: ["READY", "PROCESSING"] }, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });

    const file = await db.storedFile.create({
      data: {
        userId: opts.userId,
        batchId: opts.batchId ?? null,
        storageKey: written.key,
        originalName,
        displayName: originalName,
        extension: ext,
        mimeType: known.mime,
        sizeBytes: BigInt(written.size),
        sha256: written.sha256,
        source,
        sourceDetail,
        originalPath: opts.originalPath?.slice(0, 500) ?? null,
        documentDate: opts.documentDate ?? null,
        sensitive: opts.sensitive ?? false,
        extractedText: opts.extracted?.text.slice(0, 500_000) || null,
        pageTexts: opts.extracted?.pages ? opts.extracted.pages.map((p) => p.slice(0, 20_000)) : undefined,
        status: duplicate ? "DUPLICATE_PENDING" : "PROCESSING",
        duplicateOfId: duplicate?.id ?? null,
        jobs: duplicate ? undefined : { create: [{ kind: "process" }] },
      },
    });
    if (opts.batchId) await db.importBatch.update({ where: { id: opts.batchId }, data: { fileCount: { increment: 1 } } });
    return { file, duplicateOf: duplicate };
  } catch (e) {
    await storage.remove(written.key);
    throw e;
  }
}
