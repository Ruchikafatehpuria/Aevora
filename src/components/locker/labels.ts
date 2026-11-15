import type { FileSource } from "@prisma/client";

export const SOURCE_LABEL: Record<FileSource, string> = {
  MANUAL_UPLOAD: "Upload",
  WHATSAPP: "WhatsApp",
  SHARE_SHEET: "Share menu",
  EMAIL: "Email",
  GOOGLE_DRIVE: "Google Drive",
  ONEDRIVE: "OneDrive",
  DROPBOX: "Dropbox",
  CAMERA_SCAN: "Camera scan",
};

export const dateFmt = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
