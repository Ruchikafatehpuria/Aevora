"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { aiConfigured, PROVIDER_LABEL } from "@/lib/ai/providers";
import { answerQuestion, type Source } from "./answer";
import { backfillChunks } from "./chunks";
import { retrievePassages } from "./retrieve";
import { agendaText } from "./agenda";
import { userTimezone } from "@/lib/tasks/server";
import { formatYmd, todayIn } from "@/lib/time";

export type SendResult =
  | { ok: true; conversationId: string; message: { id: string; content: string; sources: Source[]; provider: string | null } }
  | { ok: false; conversationId: string | null; error: string };

const input = z.object({
  conversationId: z.string().nullable(),
  text: z.string().trim().min(1, "Type a message").max(4000, "That message is too long"),
  fileId: z.string().nullable(),
});

export async function sendMessage(raw: { conversationId: string | null; text: string; fileId: string | null }): Promise<SendResult> {
  const user = await requireUser();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, conversationId: raw.conversationId, error: parsed.error.issues[0]!.message };
  const { text } = parsed.data;
  if (!aiConfigured()) return { ok: false, conversationId: raw.conversationId, error: "No AI provider is configured on the server." };
  if (!(await rateLimit(`assistant:${user.id}`, 60, 3600))) {
    return { ok: false, conversationId: raw.conversationId, error: "You've sent a lot of messages this hour. Please wait a bit." };
  }

  // Load or create the conversation (always scoped to this user).
  let conversation = parsed.data.conversationId
    ? await db.conversation.findFirst({ where: { id: parsed.data.conversationId, userId: user.id } })
    : null;
  if (parsed.data.conversationId && !conversation) return { ok: false, conversationId: null, error: "Conversation not found." };
  let scopedFile: { id: string; displayName: string; sensitive: boolean } | null = null;
  const fileId = conversation?.fileId ?? parsed.data.fileId;
  if (fileId) {
    scopedFile = await db.storedFile.findFirst({ where: { id: fileId, userId: user.id, deletedAt: null }, select: { id: true, displayName: true, sensitive: true } });
    if (!scopedFile) return { ok: false, conversationId: conversation?.id ?? null, error: "That file is no longer available." };
    if (scopedFile.sensitive) return { ok: false, conversationId: conversation?.id ?? null, error: "This file is marked sensitive, so it's never sent to AI." };
  }
  conversation ??= await db.conversation.create({
    data: { userId: user.id, title: text.slice(0, 80), fileId: scopedFile?.id ?? null },
  });

  const history = await db.chatMessage.findMany({
    where: { conversationId: conversation.id, failed: false },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
    take: 40,
  });
  await db.chatMessage.create({ data: { conversationId: conversation.id, role: "user", content: text } });

  const settings = await db.lockerSettings.findUnique({ where: { userId: user.id } });
  // Asking about a specific file is explicit consent for that file; otherwise the account setting decides.
  const useFiles = !!scopedFile || !!settings?.assistantUsesFiles;
  let passages: Awaited<ReturnType<typeof retrievePassages>> = [];
  if (useFiles) {
    await backfillChunks(user.id);
    const lastUser = [...history].reverse().find((h) => h.role === "user")?.content ?? "";
    passages = await retrievePassages(user.id, `${text} ${scopedFile ? "" : lastUser}`, { fileId: scopedFile?.id, limit: scopedFile ? 10 : 8 });
  }

  try {
    const tz = await userTimezone(user.profile?.timezone);
    const today = todayIn(tz);
    const agenda = await agendaText(user.id, today, tz);
    const result = await answerQuestion({ question: text, history, passages, scopedFileName: scopedFile?.displayName, userName: user.name.split(" ")[0]!, today: `${today} (${formatYmd(today, { weekday: true, year: true })})`, agenda });
    const saved = await db.chatMessage.create({
      data: { conversationId: conversation.id, role: "assistant", content: result.content, sources: result.sources, provider: PROVIDER_LABEL[result.provider] },
    });
    await db.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    revalidatePath("/assistant", "layout");
    return { ok: true, conversationId: conversation.id, message: { id: saved.id, content: saved.content, sources: result.sources, provider: saved.provider } };
  } catch (e) {
    console.error("Assistant failed", e);
    await db.chatMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: "Sorry, I couldn't answer just now.", failed: true } });
    revalidatePath("/assistant", "layout");
    return { ok: false, conversationId: conversation.id, error: "The AI service is busy or unavailable right now. Please try again in a moment." };
  }
}

export async function deleteConversation(id: string) {
  const user = await requireUser();
  await db.conversation.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/assistant", "layout");
}

export async function setAssistantUsesFiles(enabled: boolean) {
  const user = await requireUser();
  await db.lockerSettings.upsert({ where: { userId: user.id }, create: { userId: user.id, assistantUsesFiles: enabled }, update: { assistantUsesFiles: enabled } });
  revalidatePath("/assistant", "layout");
}
