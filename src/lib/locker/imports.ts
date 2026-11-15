import "server-only";
import { Readable } from "node:stream";
import type { FileSource } from "@prisma/client";
import { db } from "@/lib/db";
import { extensionOf } from "./config";
import { IngestError, ingestStream } from "./ingest";
import { chatNameFromFilename, looksLikeWhatsAppChat, parseWhatsAppChat, type ParsedChat } from "./whatsapp-parser";
import { streamToBuffer, walkZip, ZipLimitError } from "./zip";

export type ImportResult = {
  imported: { id: string; name: string; duplicate: boolean }[];
  failed: { name: string; reason: string }[];
  archiveId?: string;
};

const isChatTxt = (name: string) => /^_chat\.txt$/i.test(name) || /^WhatsApp Chat/i.test(name);

function errorReason(e: unknown) {
  if (e instanceof IngestError || e instanceof ZipLimitError) return e.message;
  console.error(e);
  return "Unexpected error while saving";
}

async function saveChatArchive(userId: string, batchId: string, chatName: string, parsed: ParsedChat) {
  const dated = parsed.messages.filter((m) => m.sentAt);
  const archive = await db.whatsappChatArchive.create({
    data: {
      userId,
      batchId,
      chatName,
      platformHint: `${parsed.platform}${parsed.dateOrderAssumed ? " · date order assumed day/month" : ""}`,
      messageCount: parsed.messages.length,
      firstMessageAt: dated[0]?.sentAt ?? null,
      lastMessageAt: dated.at(-1)?.sentAt ?? null,
    },
  });
  // Insert messages in chunks; collect attachment references.
  const refs: { seq: number; fileName: string }[] = [];
  for (let i = 0; i < parsed.messages.length; i += 500) {
    const chunk = parsed.messages.slice(i, i + 500);
    await db.whatsappMessage.createMany({
      data: chunk.map((m) => ({
        archiveId: archive.id,
        seq: m.seq,
        sentAt: m.sentAt,
        rawTimestamp: m.rawTimestamp,
        sender: m.sender,
        body: m.mediaOmitted ? "‹media not included in export›" : m.body,
        isSystem: m.isSystem,
      })),
    });
    for (const m of chunk) for (const a of m.attachments) refs.push({ seq: m.seq, fileName: a });
  }
  const msgIds = new Map(
    (await db.whatsappMessage.findMany({ where: { archiveId: archive.id, seq: { in: refs.map((r) => r.seq) } }, select: { id: true, seq: true } })).map((m) => [m.seq, m.id]),
  );
  if (refs.length) {
    await db.whatsappAttachment.createMany({
      data: refs.map((r) => ({ archiveId: archive.id, messageId: msgIds.get(r.seq) ?? null, fileName: r.fileName, missing: true })),
    });
  }
  const sentAtByFile = new Map<string, Date>();
  for (const m of parsed.messages) for (const a of m.attachments) if (m.sentAt) sentAtByFile.set(a, m.sentAt);
  return { archive, sentAtByFile };
}

/** Links an ingested media file to the chat attachment that references it. */
async function linkAttachment(archiveId: string, fileName: string, fileId: string) {
  const att = await db.whatsappAttachment.findFirst({ where: { archiveId, fileName, fileId: null } });
  if (att) await db.whatsappAttachment.update({ where: { id: att.id }, data: { fileId, missing: false } });
  else await db.whatsappAttachment.create({ data: { archiveId, fileName, fileId, missing: false } });
}

/** Imports a ZIP. WhatsApp chat exports become a browsable archive; other ZIPs are extracted file by file. */
export async function importZip(userId: string, zipPath: string, zipName: string, source: FileSource): Promise<ImportResult> {
  const result: ImportResult = { imported: [], failed: [] };

  // Pass 1: find the chat transcript, if any.
  let chat: { name: string; text: string } | null = null;
  await walkZip(
    zipPath,
    async (info, openStream) => {
      if (chat) return;
      const text = (await streamToBuffer(await openStream(), 50 * 1048576)).toString("utf8");
      if (isChatTxt(info.name) || looksLikeWhatsAppChat(text)) chat = { name: info.name, text };
    },
    (info) => !chat && extensionOf(info.name) === "txt" && info.path.split("/").length <= 2,
  );
  const chatFound = chat as { name: string; text: string } | null;

  const isChat = !!chatFound;
  const chatName = chatFound ? chatNameFromFilename(chatFound.name) ?? chatNameFromFilename(zipName) ?? zipName.replace(/\.zip$/i, "") : null;
  const batch = await db.importBatch.create({
    data: { userId, kind: isChat ? "WHATSAPP_CHAT" : "ZIP", source: isChat ? "WHATSAPP" : source, label: chatName ?? zipName },
  });

  let archiveId: string | undefined;
  let sentAtByFile = new Map<string, Date>();
  if (chatFound && chatName) {
    const saved = await saveChatArchive(userId, batch.id, chatName, parseWhatsAppChat(chatFound.text));
    archiveId = saved.archive.id;
    sentAtByFile = saved.sentAtByFile;
    result.archiveId = archiveId;
  }

  // Pass 2: ingest every file.
  const { skipped } = await walkZip(zipPath, async (info, openStream) => {
    try {
      const fileSource: FileSource = isChat ? "WHATSAPP" : source;
      const { file, duplicateOf } = await ingestStream({
        userId,
        input: await openStream(),
        name: info.name,
        source: fileSource,
        sourceDetail: isChat ? `WhatsApp chat export: ${chatName}` : `From ZIP: ${zipName}`,
        batchId: batch.id,
        originalPath: info.path,
        documentDate: sentAtByFile.get(info.name) ?? null,
      });
      // An identical file already in the locker is the same attachment: link the chat to that copy.
      if (archiveId && chatFound && info.name !== chatFound.name) await linkAttachment(archiveId, info.name, duplicateOf?.id ?? file.id);
      result.imported.push({ id: file.id, name: info.name, duplicate: !!duplicateOf });
    } catch (e) {
      result.failed.push({ name: info.name, reason: errorReason(e) });
    }
  });
  result.failed.push(...skipped);
  if (result.failed.length) {
    await db.importBatch.update({ where: { id: batch.id }, data: { failedCount: result.failed.length, failures: result.failed } });
  }
  return result;
}

/** A bare chat .txt (exported "without media"): store it and build the archive; every attachment is marked missing. */
export async function importChatText(userId: string, buf: Buffer, name: string): Promise<ImportResult | null> {
  const text = buf.toString("utf8");
  if (!looksLikeWhatsAppChat(text)) return null;
  const chatName = chatNameFromFilename(name) ?? name.replace(/\.txt$/i, "");
  const batch = await db.importBatch.create({ data: { userId, kind: "WHATSAPP_CHAT", source: "WHATSAPP", label: chatName } });
  const { archive } = await saveChatArchive(userId, batch.id, chatName, parseWhatsAppChat(text));
  const result: ImportResult = { imported: [], failed: [], archiveId: archive.id };
  try {
    const { file, duplicateOf } = await ingestStream({
      userId, input: Readable.from(buf), name, source: "WHATSAPP", sourceDetail: `WhatsApp chat export: ${chatName}`, batchId: batch.id,
    });
    result.imported.push({ id: file.id, name, duplicate: !!duplicateOf });
  } catch (e) {
    result.failed.push({ name, reason: errorReason(e) });
  }
  return result;
}

export { errorReason };
