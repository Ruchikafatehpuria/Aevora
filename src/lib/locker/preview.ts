import "server-only";
import { storage } from "./storage";
import { streamToBuffer, walkZip, type ZipEntryInfo } from "./zip";

/** DOCX → HTML for a sandboxed preview iframe. Mammoth emits plain semantic markup and escapes text. */
export async function docxHtml(key: string) {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer: await streamToBuffer((await storage.read(key)), 50 * 1048576) });
  return value;
}

export async function csvRows(key: string, maxRows = 100) {
  const text = (await streamToBuffer((await storage.read(key, { start: 0, end: 512 * 1024 })), 1048576)).toString("utf8");
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        }
        else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") {
        cells.push(cur);
        cur = "";
      }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
    if (rows.length >= maxRows) break;
  }
  return rows;
}

export async function zipListing(key: string) {
  // walkZip needs a path; stream to a temp file first.
  const { createWriteStream } = await import("node:fs");
  const { rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { pipeline } = await import("node:stream/promises");
  const path = await import("node:path");
  const tmp = path.join(tmpdir(), `syncly-preview-${crypto.randomUUID()}.zip`);
  const entries: ZipEntryInfo[] = [];
  try {
    await pipeline((await storage.read(key)), createWriteStream(tmp));
    await walkZip(tmp, async () => {}, (info) => (entries.length < 500 && entries.push(info), false));
  } finally {
    await rm(tmp, { force: true });
  }
  return entries;
}
