import "server-only";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import type { Readable } from "node:stream";
import { limits } from "./config";

export class ZipLimitError extends Error {}

export type ZipEntryInfo = { path: string; name: string; size: number; compressedSize: number };

const IGNORED = (p: string) => p.startsWith("__MACOSX/") || /(^|\/)\.(DS_Store|_.*)$/.test(p) || /(^|\/)Thumbs\.db$/i.test(p);

/** Normalises an archive path for display only. Storage never uses archive paths, so traversal can't escape. */
export function safeArchivePath(p: string) {
  return p
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/")
    .slice(0, 500);
}

function open(path: string): Promise<ZipFile> {
  return new Promise((res, rej) =>
    // decodeStrings: false so a single malicious name (e.g. "../../x") is skipped instead of aborting the whole archive.
    yauzl.open(path, { lazyEntries: true, autoClose: true, validateEntrySizes: true, decodeStrings: false }, (err, zf) =>
      err || !zf ? rej(err ?? new Error("Couldn't open ZIP")) : res(zf),
    ),
  );
}

/**
 * Walks file entries with limits on entry count, total uncompressed size and compression ratio.
 * `onEntry` gets a stream for the entry (or null when the entry is skipped by `want`).
 */
export async function walkZip(
  path: string,
  onEntry: (info: ZipEntryInfo, open: () => Promise<Readable>) => Promise<void>,
  want: (info: ZipEntryInfo) => boolean = () => true,
) {
  const zf = await open(path);
  let count = 0;
  let total = 0;
  const skipped: { name: string; reason: string }[] = [];

  await new Promise<void>((resolve, reject) => {
    zf.on("error", reject);
    zf.on("end", resolve);
    zf.on("entry", async (entry: Entry) => {
      try {
        const raw = Buffer.isBuffer(entry.fileName) ? (entry.fileName as Buffer).toString("utf8") : String(entry.fileName);
        const p = safeArchivePath(raw);
        if (raw.endsWith("/") || !p || IGNORED(p)) return zf.readEntry();
        if (raw.split(/[\\/]/).includes("..") || /^([a-z]:)?[\\/]/i.test(raw)) {
          skipped.push({ name: raw.slice(0, 120), reason: "Unsafe path in ZIP (path traversal); skipped" });
          return zf.readEntry();
        }
        if (++count > limits.zip.maxEntries) throw new ZipLimitError(`ZIP has more than ${limits.zip.maxEntries} files`);
        const info = { path: p, name: p.split("/").pop()!, size: entry.uncompressedSize, compressedSize: entry.compressedSize };
        if (!want(info)) return zf.readEntry();
        total += entry.uncompressedSize;
        if (total > limits.zip.maxTotalUncompressedBytes) {
          throw new ZipLimitError(`ZIP expands to more than ${Math.round(limits.zip.maxTotalUncompressedBytes / 1048576)} MB`);
        }
        if (entry.uncompressedSize > 10 * 1048576 && entry.uncompressedSize / Math.max(entry.compressedSize, 1) > limits.zip.maxRatio) {
          skipped.push({ name: info.name, reason: "Suspicious compression ratio (possible ZIP bomb)" });
          return zf.readEntry();
        }
        if (entry.isEncrypted()) {
          skipped.push({ name: info.name, reason: "Encrypted ZIP entries aren't supported" });
          return zf.readEntry();
        }
        await onEntry(info, () => new Promise((res, rej) => zf.openReadStream(entry, (err, s) => (err || !s ? rej(err) : res(s)))));
        zf.readEntry();
      } catch (e) {
        zf.close();
        reject(e);
      }
    });
    zf.readEntry();
  });
  return { skipped };
}

export async function streamToBuffer(s: Readable, max: number) {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of s) {
    n += (c as Buffer).length;
    if (n > max) throw new ZipLimitError("Text file is too large to read");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}
