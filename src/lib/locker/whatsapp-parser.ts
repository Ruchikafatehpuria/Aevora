/**
 * Parser for WhatsApp's official "Export chat" text format (Android and iOS variants).
 *
 * Exported timestamps carry no timezone, so sentAt stores the wall-clock time as UTC and must be
 * displayed with timeZone "UTC" to show what the chat showed. The raw text is kept too.
 */

export type ParsedMessage = {
  seq: number;
  rawTimestamp: string;
  sentAt: Date | null;
  sender: string | null;
  body: string;
  isSystem: boolean;
  attachments: string[];
  mediaOmitted: boolean;
};

export type ParsedChat = {
  messages: ParsedMessage[];
  platform: "android" | "ios" | "unknown";
  dateOrder: "DMY" | "MDY" | "YMD";
  dateOrderAssumed: boolean;
};

const INVISIBLE = /[‎‏‪-‮﻿]/g;
const SPACE = /[  ]/g;

// [31/12/23, 9:15:01 PM] Sender: text
const IOS = /^\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]\s(.*)$/;
// 31/12/2023, 21:15 - Sender: text
const ANDROID = /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\s[-–]\s(.*)$/;

const ATTACH_IOS = /<attached:\s*([^>]+)>/i;
const ATTACH_ANDROID = /^(.+?\.[A-Za-z0-9]{1,8})\s\((?:file attached|archivo adjunto|fichier joint|Datei angehängt|arquivo anexado)\)/i;
const OMITTED = /^<?(Media omitted|image omitted|video omitted|audio omitted|document omitted|sticker omitted|GIF omitted)>?$/i;

type Header = { a: number; b: number; c: number; h: number; m: number; s: number; ampm?: string; rest: string; raw: string };

function matchHeader(line: string): { header: Header; platform: "android" | "ios" } | null {
  const clean = line.replace(INVISIBLE, "").replace(SPACE, " ");
  for (const [re, platform] of [[IOS, "ios"], [ANDROID, "android"]] as const) {
    const m = re.exec(clean);
    if (m) {
      const raw = clean.slice(0, clean.length - m[8]!.length).replace(/[\s\-–\]]+$/, "").replace(/^\[/, "");
      return {
        platform,
        header: { a: +m[1]!, b: +m[2]!, c: +m[3]!, h: +m[4]!, m: +m[5]!, s: m[6] ? +m[6] : 0, ampm: m[7], rest: m[8]!, raw },
      };
    }
  }
  return null;
}

function toDate(h: Header, order: ParsedChat["dateOrder"]): Date | null {
  let y: number, mo: number, d: number;
  if (order === "YMD") [y, mo, d] = [h.a, h.b, h.c];
  else if (order === "DMY") [d, mo, y] = [h.a, h.b, h.c];
  else [mo, d, y] = [h.a, h.b, h.c];
  if (y < 100) y += 2000;
  let hour = h.h;
  if (h.ampm) {
    const pm = /p/i.test(h.ampm);
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  const date = new Date(Date.UTC(y, mo - 1, d, hour, h.m, h.s));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export function looksLikeWhatsAppChat(text: string) {
  const lines = text.split(/\r?\n/).slice(0, 50);
  return lines.filter((l) => matchHeader(l)).length >= Math.min(3, Math.max(1, lines.filter(Boolean).length / 2));
}

export function parseWhatsAppChat(text: string): ParsedChat {
  const lines = text.split(/\r?\n/);
  const entries: { header: Header; body: string[] }[] = [];
  let platform: ParsedChat["platform"] = "unknown";

  for (const line of lines) {
    const hit = matchHeader(line);
    if (hit) {
      if (platform === "unknown") platform = hit.platform;
      entries.push({ header: hit.header, body: [hit.header.rest] });
    } else if (entries.length) {
      entries[entries.length - 1]!.body.push(line.replace(INVISIBLE, ""));
    }
  }

  // Infer date order from values that can only be a day.
  let order: ParsedChat["dateOrder"] = "DMY";
  let assumed = true;
  if (entries.some((e) => e.header.a > 31)) [order, assumed] = ["YMD", false];
  else if (entries.some((e) => e.header.a > 12)) [order, assumed] = ["DMY", false];
  else if (entries.some((e) => e.header.b > 12)) [order, assumed] = ["MDY", false];

  const messages = entries.map((e, seq): ParsedMessage => {
    const full = e.body.join("\n");
    const sep = full.indexOf(": ");
    // Lines without "Sender: " are system notices ("Messages are end-to-end encrypted", "X added Y").
    const isSystem = sep === -1 || sep > 80;
    const sender = isSystem ? null : full.slice(0, sep).trim();
    let body = isSystem ? full : full.slice(sep + 2);
    const attachments: string[] = [];
    let mediaOmitted = false;

    const ios = ATTACH_IOS.exec(body);
    if (ios) {
      attachments.push(ios[1]!.trim());
      body = body.replace(ATTACH_IOS, "").trim();
    } else {
      const kept: string[] = [];
      for (const line of body.split("\n")) {
        const android = ATTACH_ANDROID.exec(line.trim());
        if (android) attachments.push(android[1]!.trim());
        else kept.push(line);
      }
      body = kept.join("\n");
      if (!attachments.length && OMITTED.test(body.trim())) mediaOmitted = true;
    }
    return { seq, rawTimestamp: e.header.raw, sentAt: toDate(e.header, order), sender, body: body.trim(), isSystem, attachments, mediaOmitted };
  });

  return { messages, platform, dateOrder: order, dateOrderAssumed: assumed };
}

/** "WhatsApp Chat with Asha.txt" → "Asha" */
export function chatNameFromFilename(name: string) {
  const m = /WhatsApp Chat(?: with| -)?\s*(.+?)(?:\.txt|\.zip)?$/i.exec(name);
  return m?.[1]?.trim() || null;
}
