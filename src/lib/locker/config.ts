const mb = (v: string | undefined, d: number) => (Number(v) > 0 ? Number(v) : d) * 1024 * 1024;

export const limits = {
  maxUploadBytes: mb(process.env.MAX_UPLOAD_MB, 200),
  quotaBytes: mb(process.env.STORAGE_QUOTA_MB, 5120),
  zip: {
    maxEntries: 2000,
    maxTotalUncompressedBytes: mb(process.env.ZIP_MAX_UNCOMPRESSED_MB, 2048),
    /** Abort entries whose compression ratio looks like a zip bomb. */
    maxRatio: 200,
  },
};

export type FileKind = "document" | "pdf" | "spreadsheet" | "presentation" | "image" | "video" | "audio" | "archive" | "text";

/** Allowed extensions and their kind. Anything else is rejected. */
export const EXTENSIONS: Record<string, { kind: FileKind; mime: string }> = {
  pdf: { kind: "pdf", mime: "application/pdf" },
  doc: { kind: "document", mime: "application/msword" },
  docx: { kind: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  odt: { kind: "document", mime: "application/vnd.oasis.opendocument.text" },
  rtf: { kind: "document", mime: "application/rtf" },
  ppt: { kind: "presentation", mime: "application/vnd.ms-powerpoint" },
  pptx: { kind: "presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  odp: { kind: "presentation", mime: "application/vnd.oasis.opendocument.presentation" },
  xls: { kind: "spreadsheet", mime: "application/vnd.ms-excel" },
  xlsx: { kind: "spreadsheet", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ods: { kind: "spreadsheet", mime: "application/vnd.oasis.opendocument.spreadsheet" },
  csv: { kind: "spreadsheet", mime: "text/csv" },
  txt: { kind: "text", mime: "text/plain" },
  md: { kind: "text", mime: "text/markdown" },
  json: { kind: "text", mime: "application/json" },
  zip: { kind: "archive", mime: "application/zip" },
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  png: { kind: "image", mime: "image/png" },
  webp: { kind: "image", mime: "image/webp" },
  gif: { kind: "image", mime: "image/gif" },
  heic: { kind: "image", mime: "image/heic" },
  mp4: { kind: "video", mime: "video/mp4" },
  mov: { kind: "video", mime: "video/quicktime" },
  "3gp": { kind: "video", mime: "video/3gpp" },
  webm: { kind: "video", mime: "video/webm" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  m4a: { kind: "audio", mime: "audio/mp4" },
  aac: { kind: "audio", mime: "audio/aac" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  opus: { kind: "audio", mime: "audio/ogg" },
  wav: { kind: "audio", mime: "audio/wav" },
  vcf: { kind: "text", mime: "text/vcard" },
};

export const ACCEPT_ATTR = Object.keys(EXTENSIONS).map((e) => `.${e}`).join(",");

export function extensionOf(name: string) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "";
}

export function kindOf(ext: string): FileKind | null {
  return EXTENSIONS[ext]?.kind ?? null;
}

/** Inline preview is only allowed for types browsers render without executing code. */
export const INLINE_SAFE_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "text/plain", "text/csv", "text/markdown",
  "video/mp4", "video/quicktime", "video/webm", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav",
]);

export const DEFAULT_CATEGORIES = [
  "College Notes", "Assignments", "Study Materials", "Books", "Presentations", "Spreadsheets", "Certificates",
  "Internship Documents", "Resume", "Projects", "Personal Documents", "Identity Documents", "Receipts", "Invoices",
  "Offer Letters", "Images", "Videos", "Audio", "Important Documents", "Other",
];

export function formatBytes(n: number | bigint) {
  let v = Number(n);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** WhatsApp media filenames, e.g. IMG-20240131-WA0007.jpg or 00000012-PHOTO-2024-01-31-21-15-01.jpg */
export const WHATSAPP_FILENAME = /^(IMG|VID|AUD|PTT|DOC|STK)-\d{8}-WA\d{4}|^\d{8}-(PHOTO|VIDEO|AUDIO|DOCUMENT)-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}|^WhatsApp (Image|Video|Audio|Ptt) \d{4}-\d{2}-\d{2}/i;
