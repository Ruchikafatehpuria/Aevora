import "server-only";
import { db } from "@/lib/db";
import { aiEnabled, classifyFile } from "./ai";
import { kindOf } from "./config";
import { extractText } from "./extract";
import { indexFileChunks } from "@/lib/assistant/chunks";
import { applySuggestion, folderPaths, getLockerSettings, matchRule, userCategories, type StoredSuggestion } from "./organize";

/** Processes one file: extract text, then organize by rule, AI suggestion, or leave in the Inbox. */
async function processFile(fileId: string) {
  const file = await db.storedFile.findUnique({ where: { id: fileId }, include: { user: { include: { profile: true } } } });
  if (!file || file.status === "DUPLICATE_PENDING") return;
  const notes: string[] = [];

  let text: string | null = file.extractedText;
  try {
    const extracted = await extractText(file);
    // Don't replace existing text (e.g. OCR from a scan) with an empty extraction.
    if (extracted && extracted.text.trim()) {
      text = extracted.text;
      await db.storedFile.update({ where: { id: file.id }, data: { extractedText: extracted.text || null, pageTexts: extracted.pages ?? undefined } });
    }
  } catch (e) {
    console.error("Text extraction failed", file.id, e);
    notes.push("Text couldn't be extracted from this file.");
  }

  if (text) {
    try {
      await indexFileChunks(file.id);
    } catch (e) {
      console.error("Indexing passages failed", file.id, e);
    }
  }

  if (file.organization === "INBOX") {
    const rule = await matchRule(file);
    if (rule) {
      await applySuggestion(file.id, file.userId, { folderPath: rule.folderPath.split("/").map((s) => s.trim()), category: rule.category ?? "", tags: file.tags });
    } else {
      const settings = await getLockerSettings(file.userId);
      if (settings.organizeMode !== "MANUAL" && aiEnabled()) {
        const isImage = kindOf(file.extension) === "image" && ["jpg", "jpeg", "png", "webp", "gif"].includes(file.extension) && Number(file.sizeBytes) <= 5 * 1048576;
        const p = file.user.profile;
        try {
          const s = await classifyFile({
            name: file.displayName,
            extension: file.extension,
            mimeType: file.mimeType,
            sizeBytes: Number(file.sizeBytes),
            source: file.sourceDetail ?? file.source,
            originalPath: file.originalPath,
            // Sensitive files (IDs, financial documents) never have their contents sent to AI.
            excerpt: settings.aiReadsContent && !file.sensitive && text ? text.slice(0, 6000) : null,
            image: settings.aiReadsContent && !file.sensitive && isImage ? { key: file.storageKey, mime: file.mimeType } : null,
            folders: (await folderPaths(file.userId)).map((f) => f.path).slice(0, 200),
            categories: await userCategories(file.userId),
            profileHint: p ? [p.educationLevel, p.fieldOfStudy, p.institution].filter(Boolean).join(", ") || null : null,
          });
          if (s) {
            const stored: StoredSuggestion = { ...s, createdAt: new Date().toISOString() };
            await db.storedFile.update({
              where: { id: file.id },
              data: {
                suggestion: stored,
                organization: "SUGGESTED",
                ...(s.visibleText && !text ? { extractedText: s.visibleText.slice(0, 500_000) } : {}),
              },
            });
            // Uncertain classifications are never applied silently, even in automatic mode.
            if (settings.organizeMode === "AUTO" && s.confidence >= settings.autoApplyMinConfidence) {
              await applySuggestion(file.id, file.userId, s, true);
            }
          }
        } catch (e) {
          console.error("AI classification failed", file.id, e);
          notes.push("AI organization was unavailable; the file stayed in your Inbox.");
        }
      }
    }
  }

  await db.storedFile.update({ where: { id: file.id }, data: { status: "READY", failureReason: notes.join(" ") || null } });
}

/** Claims and runs queued jobs. Safe to call concurrently; each job is claimed atomically. */
export async function runPendingJobs(limit = 10) {
  await db.fileProcessingJob.updateMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) }, attempts: { lt: 3 } },
    data: { status: "QUEUED" },
  });
  const jobs = await db.fileProcessingJob.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: limit });
  for (const job of jobs) {
    const claimed = await db.fileProcessingJob.updateMany({ where: { id: job.id, status: "QUEUED" }, data: { status: "RUNNING", attempts: { increment: 1 } } });
    if (claimed.count !== 1) continue;
    try {
      await processFile(job.fileId);
      await db.fileProcessingJob.update({ where: { id: job.id }, data: { status: "DONE", error: null } });
    } catch (e) {
      console.error("Job failed", job.id, e);
      await db.fileProcessingJob.update({ where: { id: job.id }, data: { status: "FAILED", error: String(e).slice(0, 500) } });
      await db.storedFile.update({ where: { id: job.fileId }, data: { status: "READY", failureReason: "Processing failed. You can retry from the file page." } }).catch(() => {});
    }
  }
  return jobs.length;
}
