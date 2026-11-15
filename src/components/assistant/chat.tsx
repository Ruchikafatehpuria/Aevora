"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { sourceHref } from "@/lib/assistant/source-href";
import { useRouter } from "next/navigation";
import { ArrowUp, FileText, Sparkles } from "lucide-react";
import { sendMessage, setAssistantUsesFiles } from "@/lib/assistant/actions";
import type { Source } from "@/lib/assistant/answer";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { MessageText } from "./message-text";

export type ChatMsg = { id: string; role: "user" | "assistant"; content: string; sources: Source[]; provider: string | null; failed?: boolean };

const SUGGESTIONS_FILES = ["What files do I have about machine learning?", "What's due this week?", "Find my certificates", "What deadlines are mentioned in my files?"];
const SUGGESTIONS_GENERAL = ["What's due this week?", "Make me a 2-week Python study plan as tasks", "Help me write a cover letter opening", "Quiz me on SQL joins"];

export function Chat({
  conversationId,
  initial,
  file,
  usesFiles,
  aiReady,
  existingTasks = [],
}: {
  conversationId: string | null;
  initial: ChatMsg[];
  file: { id: string; name: string } | null;
  usesFiles: boolean;
  aiReady: boolean;
  /** proposalKey() of tasks that already exist, to mark assistant proposals as added. */
  existingTasks?: string[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const existing = useMemo(() => new Set(existingTasks), [existingTasks]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [filesOn, setFilesOn] = useState(usesFiles);
  const [, startToggle] = useTransition();
  const id = useRef(conversationId);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which React must not receive.
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const send = (value: string) => {
    const q = value.trim();
    if (!q || pending) return;
    setError(null);
    setText("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: q, sources: [], provider: null }]);
    start(async () => {
      const res = await sendMessage({ conversationId: id.current, text: q, fileId: file?.id ?? null });
      if (res.conversationId && !id.current) {
        id.current = res.conversationId;
        window.history.replaceState(null, "", `/assistant/${res.conversationId}`);
      }
      if (res.ok) setMessages((m) => [...m, { id: res.message.id, role: "assistant", content: res.message.content, sources: res.message.sources, provider: res.message.provider }]);
      else setError(res.error);
      router.refresh();
    });
  };

  const suggestions = file ? [`Summarise ${file.name}`, "What are the key points?", "List the deadlines in this as tasks", "Explain the hardest part simply"] : filesOn ? SUGGESTIONS_FILES : SUGGESTIONS_GENERAL;

  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-[28rem] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        {file ? (
          <p className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" /> Asking about{" "}
            <Link href={`/locker/files/${file.id}`} className="truncate font-medium text-ink hover:text-primary">{file.name}</Link>
          </p>
        ) : (
          <label className="flex items-center gap-2 text-sm text-ink-2" title="When on, relevant passages from your files (never sensitive or trashed ones) are sent to the AI provider with your question.">
            <input
              type="checkbox"
              checked={filesOn}
              onChange={(e) => {
                setFilesOn(e.target.checked);
                startToggle(() => setAssistantUsesFiles(e.target.checked));
              }}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Answer from my files
          </label>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center pt-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-violet-500">
              <Sparkles className="h-6 w-6 text-white" />
            </span>
            <p className="mt-4 font-display text-lg font-semibold text-ink">{file ? "Ask anything about this file" : "How can I help?"}</p>
            <p className="mt-1 text-sm text-ink-2">
              {file
                ? "Answers come from this file's text, with page references."
                : filesOn
                  ? "I will look through your files and notes (except sensitive or private ones) and cite what I use."
                  : "Ask me anything. Turn on “Answer from my files” to ask about your documents and notes."}
            </p>
            {!aiReady && <Alert tone="error" className="mt-4 text-left">No AI provider is configured on the server, so the assistant can&apos;t answer yet.</Alert>}
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={!aiReady} className="rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:border-primary hover:text-ink disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-6">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-ink">{m.content}</p>
                ) : (
                  <div className={cn("max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3", m.failed && "border-danger/40")}>
                    {m.failed ? <p className="text-sm text-danger">{m.content}</p> : <MessageText text={m.content} sources={m.sources} existingTasks={existing} />}
                    {m.sources.length > 0 && (
                      <ol className="mt-3 space-y-1 border-t border-border pt-2.5">
                        {m.sources.map((s) => (
                          <li key={s.n} className="flex gap-2 text-xs">
                            <span className="font-semibold text-primary">[{s.n}]</span>
                            <Link href={sourceHref(s)} className="truncate text-ink-2 hover:text-primary">
                              {s.fileName}
                              {s.page && <span className="text-ink-3"> · {s.pageLabel} {s.page}</span>}
                            </Link>
                          </li>
                        ))}
                      </ol>
                    )}
                    {m.provider && <p className="mt-2 text-[11px] text-ink-3">Answered by {m.provider}</p>}
                  </div>
                )}
              </li>
            ))}
            {pending && (
              <li className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3 text-sm text-ink-2">
                  <span className="flex gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 150}ms` }} />)}
                  </span>
                  Thinking… free AI can take up to 30 seconds
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-card focus-within:border-primary"
      >
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={file ? `Ask about ${file.name}…` : "Message Syncly Brain…"}
          aria-label="Message"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:shadow-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || pending || !aiReady}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-ink transition-opacity disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
      <p className="mt-2 text-center text-[11px] text-ink-3">AI can make mistakes. Check important answers against the cited files.</p>
    </div>
  );
}
