import "server-only";
import yauzl from "yauzl";
import { storage } from "./storage";
import { streamToBuffer } from "./zip";

const MAX_EXTRACT_BYTES = 50 * 1048576;
const MAX_TEXT = 500_000;

export type Extracted = { text: string; pages?: string[] } | null;

async function readFile(key: string) {
  return streamToBuffer((await storage.read(key)), MAX_EXTRACT_BYTES);
}

/** Reads matching XML parts out of an OOXML (zip) document and returns their text runs. */
function ooxmlText(buf: Buffer, partPattern: RegExp, textTag: RegExp): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zf) => {
      if (err || !zf) return reject(err);
      const parts: { name: string; text: string }[] = [];
      let total = 0;
      zf.on("entry", (entry) => {
        if (!partPattern.test(entry.fileName) || entry.uncompressedSize > 20 * 1048576 || (total += entry.uncompressedSize) > 100 * 1048576) {
          return zf.readEntry();
        }
        zf.openReadStream(entry, async (e, s) => {
          if (e || !s) return reject(e);
          const xml = (await streamToBuffer(s, 20 * 1048576)).toString("utf8");
          const runs = [...xml.matchAll(textTag)].map((m) => decodeXml(m[1]!));
          parts.push({ name: entry.fileName, text: runs.join(" ") });
          zf.readEntry();
        });
      });
      zf.on("end", () => resolve(parts.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((p) => p.text)));
      zf.on("error", reject);
      zf.readEntry();
    });
  });
}

function decodeXml(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export async function extractText(file: { storageKey: string; extension: string; sizeBytes: bigint }): Promise<Extracted> {
  if (Number(file.sizeBytes) > MAX_EXTRACT_BYTES) return null;
  const ext = file.extension;
  if (["txt", "md", "csv", "json", "vcf"].includes(ext)) {
    return { text: (await readFile(file.storageKey)).toString("utf8").slice(0, MAX_TEXT) };
  }
  if (ext === "pdf") {
    const { extractText: pdfText } = await import("unpdf");
    const { text } = await pdfText(new Uint8Array(await readFile(file.storageKey)), { mergePages: false });
    const pages = text.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 20_000));
    return { text: pages.join("\n\n").slice(0, MAX_TEXT), pages };
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: await readFile(file.storageKey) });
    return { text: value.slice(0, MAX_TEXT) };
  }
  if (ext === "pptx") {
    const slides = await ooxmlText(await readFile(file.storageKey), /^ppt\/slides\/slide\d+\.xml$/, /<a:t>([^<]*)<\/a:t>/g);
    return { text: slides.join("\n\n").slice(0, MAX_TEXT), pages: slides };
  }
  if (ext === "xlsx") {
    const strings = await ooxmlText(await readFile(file.storageKey), /^xl\/sharedStrings\.xml$/, /<t[^>]*>([^<]*)<\/t>/g);
    return { text: strings.join("\n").slice(0, MAX_TEXT) };
  }
  return null;
}
